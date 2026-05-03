using Microsoft.AspNetCore.SignalR;

public class GridHub : Hub
{
    private static readonly string[] Colors = {
        "#e74c3c","#e67e22","#f1c40f","#2ecc71",
        "#1abc9c","#3498db","#9b59b6","#e91e63"
    };
    private static readonly string[] Adjectives = { "Fast", "Bold", "Keen", "Sharp", "Swift" };
    private static readonly string[] Nouns = { "Falcon", "Wolf", "Hawk", "Bear", "Fox" };
    private static readonly Random Rng = new();

    private readonly GridService _grid;

    public GridHub(GridService grid) => _grid = grid;

    public override async Task OnConnectedAsync()
    {
        var color = Colors[Rng.Next(Colors.Length)];
        var name = $"{Adjectives[Rng.Next(Adjectives.Length)]}{Nouns[Rng.Next(Nouns.Length)]}{Rng.Next(10, 99)}";
        var userId = Guid.NewGuid().ToString("N")[..8];
        var user = new UserInfo(Context.ConnectionId, userId, name, color);
        _grid.AddUser(user);

        await Clients.Caller.SendAsync("Connected", user, _grid.GetSnapshot());
        await Clients.All.SendAsync("OnlineCount", _grid.OnlineCount);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? ex)
    {
        _grid.RemoveUser(Context.ConnectionId);
        await Clients.All.SendAsync("OnlineCount", _grid.OnlineCount);
        await base.OnDisconnectedAsync(ex);
    }

    public async Task CaptureCell(int index)
    {
        if (!_grid.TryGetUser(Context.ConnectionId, out var user) || user is null) return;

        var (success, reason, newState) = _grid.TryCapture(
            index, user.UserId, user.Color, user.DisplayName);

        if (success && newState is not null)
        {
            await Clients.All.SendAsync("CellCaptured", newState);
            await Clients.All.SendAsync("Leaderboard", _grid.GetLeaderboard());
        }
        else
        {
            await Clients.Caller.SendAsync("CaptureRejected", new { index, reason });
        }
    }

    public async Task GetSnapshot()
    {
        await Clients.Caller.SendAsync("Snapshot", _grid.GetSnapshot());
    }
}
