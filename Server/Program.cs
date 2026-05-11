var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();
builder.Services.AddSingleton<GridService>();
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(
        "https://gridwar-deepaks-projects-70214c28.vercel.app",
        "http://localhost:4200"
     )
     .AllowAnyHeader()
     .AllowAnyMethod()
     .AllowCredentials()));

var app = builder.Build();

app.UseCors();
app.MapGet("/health", () => "ok");
app.MapHub<GridHub>("/hubs/grid");

app.Run();
