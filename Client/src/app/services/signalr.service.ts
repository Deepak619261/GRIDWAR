import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';

@Injectable({ providedIn: 'root' })
export class SignalrService {
  readonly connection = new signalR.HubConnectionBuilder()
    .withUrl('http://localhost:5000/hubs/grid')
    .withAutomaticReconnect()
    .build();

  start() { return this.connection.start(); }
}
