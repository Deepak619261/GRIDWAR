using System.Collections.Concurrent;

public class GridService
{
    private const int GridSize = 2500; // 50×50
    private readonly ConcurrentDictionary<int, CellState> _grid;
    private readonly ConcurrentDictionary<string, UserInfo> _users = new();
    private readonly ConcurrentDictionary<string, DateTime> _cooldowns = new();
    private static readonly TimeSpan CooldownDuration = TimeSpan.FromSeconds(1.5);

    public GridService()
    {
        _grid = new ConcurrentDictionary<int, CellState>(
            Enumerable.Range(0, GridSize)
                      .Select(i => new KeyValuePair<int, CellState>(
                          i, new CellState(i, null, null, null, 0, DateTime.MinValue)))
        );
    }

    public CellState[] GetSnapshot() =>
        _grid.Values.OrderBy(c => c.Index).ToArray();

    public (bool Success, string? Reason, CellState? NewState) TryCapture(
        int index, string userId, string color, string name)
    {
        if (_cooldowns.TryGetValue(userId, out var lastCapture) &&
            DateTime.UtcNow - lastCapture < CooldownDuration)
            return (false, "cooldown", null);

        var current = _grid[index];
        var updated = current with
        {
            OwnerId = userId,
            OwnerColor = color,
            OwnerName = name,
            Version = current.Version + 1,
            CapturedAt = DateTime.UtcNow
        };

        if (_grid.TryUpdate(index, updated, current))
        {
            _cooldowns[userId] = DateTime.UtcNow;
            return (true, null, updated);
        }

        return (false, "race", null);
    }

    public void AddUser(UserInfo user) => _users[user.ConnectionId] = user;
    public void RemoveUser(string connectionId) => _users.TryRemove(connectionId, out _);
    public bool TryGetUser(string connectionId, out UserInfo? user) =>
        _users.TryGetValue(connectionId, out user);
    public int OnlineCount => _users.Count;

    public (string Name, string Color, int CellCount)[] GetLeaderboard() =>
        _grid.Values
            .Where(c => c.OwnerId != null)
            .GroupBy(c => new { c.OwnerId, c.OwnerName, c.OwnerColor })
            .Select(g => (g.Key.OwnerName ?? "?", g.Key.OwnerColor ?? "#fff", g.Count()))
            .OrderByDescending(x => x.Item3)
            .Take(5)
            .ToArray();
}
