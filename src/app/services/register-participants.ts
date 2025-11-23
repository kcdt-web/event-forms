import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class RegistrationService {
  private functionUrl = 'https://blopfvarveykkggbpkfr.supabase.co/functions/v1/register-participant';

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
