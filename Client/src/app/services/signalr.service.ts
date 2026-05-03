import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';

const HUB_URL = (window as any).__HUB_URL__ ?? 'http://localhost:5000/hubs/grid';

@Injectable({ providedIn: 'root' })
export class SignalrService {
  readonly connection = new signalR.HubConnectionBuilder()
    .withUrl(HUB_URL)
    .withAutomaticReconnect()
    .build();

  start() { return this.connection.start(); }
}
