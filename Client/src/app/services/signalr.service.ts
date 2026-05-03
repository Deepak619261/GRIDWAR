import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SignalrService {
  readonly connection = new signalR.HubConnectionBuilder()
    .withUrl(environment.hubUrl)
    .withAutomaticReconnect()
    .build();

  start() { return this.connection.start(); }
}
