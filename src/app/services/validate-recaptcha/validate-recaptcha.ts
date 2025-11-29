import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ReCaptchaV3Service } from 'ng-recaptcha';

import { environment } from '../../../environments/environment.prod';

@Injectable({
  providedIn: 'root',
})
export class ValidateRecaptcha {

  constructor(private recaptchaV3Service: ReCaptchaV3Service) { }

  /**
   * Runs Google reCAPTCHA v3 and verifies it on the backend.
   * Returns:
   *   true  => fully verified
   *   false => verification failed (token invalid, backend says fail)
   * Throws on unexpected runtime or network errors.
   */
  async verifyRecaptcha(): Promise<boolean> {
    try {
      // 1) Run reCAPTCHA v3
      const token = await firstValueFrom(
        this.recaptchaV3Service.execute('submit')
      );
      if (!token) return false;

      // 2) Verify token via backend edge function
      const resp = await fetch(environment.recaptchaEdgeFunction, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await resp.json();

      if (!resp.ok || !data?.success) {
        return false;
      }

      return true;
    } catch (err) {
      throw err;
    }
  }

}
