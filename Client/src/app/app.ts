import { Component, OnInit } from '@angular/core';
import { SignalrService } from './services/signalr.service';

@Component({
  selector: 'app-root',
  imports: [],
  template: `<h1>GRIDapp — check console for SignalR ping</h1>`,
  styles: [`h1 { font-family: monospace; padding: 2rem; }`]
})
export class App implements OnInit {
  constructor(private signalr: SignalrService) {}

  async ngOnInit() {
    this.signalr.connection.on('Pong', (msg: string) => {
      console.log('[Pong received]', msg);
    });

    await this.signalr.start();
    console.log('[SignalR] connected, id:', this.signalr.connection.connectionId);
    await this.signalr.connection.invoke('Ping', 'hello from Angular');
  }
}
