public record CellState(
    int Index,
    string? OwnerId,
    string? OwnerColor,
    string? OwnerName,
    long Version,
    DateTime CapturedAt
);
