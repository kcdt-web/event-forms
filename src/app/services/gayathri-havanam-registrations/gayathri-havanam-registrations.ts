import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class GayathriHavanamRegistrations {
  private functionUrl = 'https://pxjvvcdfaaakyuglmvig.supabase.co/functions/v1/gayathri-havanam-registrations';

  async registerParticipant(mainData: any, accompData: any[]): Promise<any> {
    const resp = await fetch(this.functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mainData, accompData })
    });

    const data = await resp.json();
    if (!resp.ok || !data.success) {
      throw new Error(data.error || 'Registration failed');
    }
    return data;
  }
}
