using Microsoft.AspNetCore.SignalR;

public class GridHub : Hub
{
    public async Task Ping(string message)
    {
        await Clients.Caller.SendAsync("Pong", $"Server echoed: {message}");
    }
}
