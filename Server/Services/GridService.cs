using System.Collections.Concurrent;

public class GridService
{
    private const int GridSize = 2500;
    private static readonly TimeSpan CellLockDuration = TimeSpan.FromSeconds(3);

    private readonly ConcurrentDictionary<int, CellState> _grid;
    private readonly ConcurrentDictionary<string, UserInfo> _users = new();
    // Per-cell lock — not per-user. Any cell can only be captured once every 3s.
    // Different cells are completely independent.
    private readonly ConcurrentDictionary<int, DateTime> _cellLocks = new();

    // Circular activity feed — last 20 events
    private readonly ConcurrentQueue<ActivityEvent> _activity = new();
    private int _activityCount = 0;

    public GridService()
    {
        _grid = new ConcurrentDictionary<int, CellState>(
            Enumerable.Range(0, GridSize)
                .Select(i => new KeyValuePair<int, CellState>(
                    i, new CellState(i, null, null, null, 0, DateTime.MinValue)))
        );
    }

    public CellState[] GetSnapshot() => _grid.Values.OrderBy(c => c.Index).ToArray();

    public ActivityEvent[] GetRecentActivity() => _activity.ToArray();

    public (bool Success, string? Reason, CellState? NewState) TryCapture(
        int index, string userId, string color, string name)
    {
        // Per-cell lock check — other cells are unaffected
        if (_cellLocks.TryGetValue(index, out var lockedAt) &&
            DateTime.UtcNow - lockedAt < CellLockDuration)
            return (false, "locked", null);

        var current = _grid[index];
        var updated = current with
        {
            OwnerId    = userId,
            OwnerColor = color,
            OwnerName  = name,
            Version    = current.Version + 1,
            CapturedAt = DateTime.UtcNow
        };

        if (_grid.TryUpdate(index, updated, current))
        {
            _cellLocks[index] = DateTime.UtcNow;
            AddActivity(new ActivityEvent(name, color, index, DateTime.UtcNow));
            return (true, null, updated);
        }

        return (false, "race", null);
    }

    private void AddActivity(ActivityEvent ev)
    {
        _activity.Enqueue(ev);
        System.Threading.Interlocked.Increment(ref _activityCount);
        // Keep only last 20
        while (_activityCount > 20)
        {
            if (_activity.TryDequeue(out _))
                System.Threading.Interlocked.Decrement(ref _activityCount);
            else break;
        }
    }

    public void Reset()
    {
        foreach (var key in _grid.Keys)
            _grid[key] = new CellState(key, null, null, null, 0, DateTime.MinValue);
        _cellLocks.Clear();
        while (_activity.TryDequeue(out _)) { }
        System.Threading.Interlocked.Exchange(ref _activityCount, 0);
    }

    public void AddUser(UserInfo user) => _users[user.ConnectionId] = user;
    public void RemoveUser(string connectionId) => _users.TryRemove(connectionId, out _);
    public bool TryGetUser(string connectionId, out UserInfo? user) =>
        _users.TryGetValue(connectionId, out user);
    public int OnlineCount => _users.Count;

    public LeaderboardEntry[] GetLeaderboard() =>
        _grid.Values
            .Where(c => c.OwnerId != null)
            .GroupBy(c => new { c.OwnerId, c.OwnerName, c.OwnerColor })
            .Select(g => new LeaderboardEntry(g.Key.OwnerName ?? "?", g.Key.OwnerColor ?? "#fff", g.Count()))
            .OrderByDescending(x => x.CellCount)
            .Take(5)
            .ToArray();
}
