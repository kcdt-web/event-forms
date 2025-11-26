import {
  Component,
  ChangeDetectorRef,
  OnInit,
  ElementRef,
  HostListener,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { PanelModule } from 'primeng/panel';
import { ButtonModule } from 'primeng/button';
import { ReCaptchaV3Service } from 'ng-recaptcha';
import { countries } from 'countries-list';
import {
  CountryCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  getExampleNumber,
} from 'libphonenumber-js';
import examples from 'libphonenumber-js/mobile/examples';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment.prod';

interface Country {
  name: string;
  iso2: string;
  phoneCode: string;
  displayName: string;
}

interface Option {
  name: string;
  value: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-gayathri-havanam',
  imports: [CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FloatLabelModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    SelectButtonModule,
    PanelModule,
    ButtonModule,],
  templateUrl: './gayathri-havanam.html',
  styleUrl: './gayathri-havanam.scss',
})
export class GayathriHavanam implements OnInit {
  registerForm!: FormGroup;
  countriesList: Country[] = [];
  activityOptions: Option[] = [];
  invalidPhoneNumber = false;
  mobileNumberMinLength = 4;
  mobileNumberMaxLength = 15;
  mobileNumberErrorMsg = 'Invalid phone number.';
  loading = false;
  registrationSuccess = false;
  submissionError = '';
  submitted = false;
  isMobile = false;

  day1Slots: Option[] = [];
  day2Slots: Option[] = [];
  day3Slots: Option[] = [];

  private readonly MAX_SLOTS_PER_DAY: any = {
    day1: 4,
    day2: 4,
    day3: 4
  };
  private readonly MAX_CONSECUTIVE = 2;

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
    private el: ElementRef,
    private recaptchaV3Service: ReCaptchaV3Service
  ) { }

  ngOnInit(): void {
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    this.initializeOptions();
    this.prepareCountries();

    const defaultCountry = this.getCountryByIso('IN');
    this.updatePhoneLength(defaultCountry?.iso2);

    this.initializeForm(defaultCountry);
    this.handleFormChanges();
  }

  /** Prevent accidental page exit */
  private hasUnsavedData(): boolean {
    if (!this.registerForm) return false;
    return this.registerForm.dirty && !this.registrationSuccess;
  }

  @HostListener('window:beforeunload', ['$event'])
  handleBeforeUnload(event: BeforeUnloadEvent): string | undefined {
    if (this.hasUnsavedData()) {
      event.preventDefault();
      event.returnValue = '';
      return '';
    }
    return undefined;
  }

  /** Dropdown Options */
  private initializeOptions(): void {
    // Day 1: 07:00 - 17:00 (10 slots)
    this.day1Slots = this.generateHourlySlots(7, 17);

    // Day 2: 07:00 - 17:00 (10 slots)
    this.day2Slots = this.generateHourlySlots(7, 17);

    // Day 3: 07:00 - 11:00 (4 slots)
    this.day3Slots = this.generateHourlySlots(7, 11);
  }

  /** Generate 1-hour slots between start and end hours (24h format) */
  private generateHourlySlots(startHour: number, endHour: number): Option[] {
    const slots: Option[] = [];
    for (let hour = startHour; hour < endHour; hour++) {
      const start = this.formatHour(hour);
      const end = this.formatHour(hour + 1);
      slots.push({
        name: `${start}`,
        value: `${start}`
      });
    }
    return slots;
  }

  /** Format hour in 12-hour format with AM/PM */
  private formatHour(hour: number): string {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 === 0 ? 12 : hour % 12;
    return `${h.toString().padStart(2, '0')}:00 ${ampm}`;
  }

  private enforceSlotConstraints(): void {
    const activitiesGroup = this.registerForm.get('activities')!;
    type DayKey = 'day1' | 'day2' | 'day3';
    const days: DayKey[] = ['day1', 'day2', 'day3'];

    days.forEach((day) => {
      const selected: string[] = activitiesGroup.get(day)?.value || [];
      const slots: Option[] =
        day === 'day1' ? this.day1Slots :
          day === 'day2' ? this.day2Slots :
            this.day3Slots;

      const disabledSlots: string[] = [];

      // 1️⃣ Disable all remaining if max slots per day reached
      if (selected.length >= this.MAX_SLOTS_PER_DAY[day]) {
        slots.forEach(s => {
          if (!selected.includes(s.value)) disabledSlots.push(s.value);
        });
      }

      // 2️⃣ Disable previous and next slot if 2 consecutive slots selected
      const slotTimes = slots.map(s => this.convertToHour(s.value));
      const selectedIndices = selected
        .map(s => slotTimes.indexOf(this.convertToHour(s)))
        .sort((a, b) => a - b);

      for (let i = 0; i < selectedIndices.length - 1; i++) {
        if (selectedIndices[i + 1] - selectedIndices[i] === 1) {
          // Disable next slot if not selected
          const nextIndex = selectedIndices[i + 1] + 1;
          if (nextIndex < slots.length && !selected.includes(slots[nextIndex].value)) {
            disabledSlots.push(slots[nextIndex].value);
          }

          // Disable previous slot if not selected
          const prevIndex = selectedIndices[i] - 1;
          if (prevIndex >= 0 && !selected.includes(slots[prevIndex].value)) {
            disabledSlots.push(slots[prevIndex].value);
          }
        }
      }

      // Apply disabled property
      slots.forEach(s => s.disabled = disabledSlots.includes(s.value));
    });
  }

  getSelectedCount(day: 'day1' | 'day2' | 'day3'): number {
    const activities = this.registerForm.get('activities')?.value;
    if (!activities) return 0;
    return (activities[day] || []).length;
  }


  private convertToHour(slot: string): number {
    const [start] = slot.split(' - ');
    const [h, mPart] = start.split(':');
    const hour = parseInt(h, 10);
    return start.includes('PM') && hour !== 12 ? hour + 12 : hour === 12 && start.includes('AM') ? 0 : hour;
  }

  /** Build Country List */
  private prepareCountries(): void {
    this.countriesList = Object.entries(countries).map(([iso2, data]) => ({
      name: data.name,
      iso2,
      phoneCode: String(data.phone?.[0] || ''),
      displayName: `${data.name} (+${String(data.phone?.[0] || '')})`,
    }));
  }

  private getCountryByIso(iso2: string): Country | undefined {
    return this.countriesList.find((c) => c.iso2 === iso2);
  }

  /** Main Form Init */
  private initializeForm(defaultCountry?: Country): void {
    this.registerForm = this.fb.group({
      kcdt_member_id: [null, Validators.required],
      full_name: [null, Validators.required],
      country_code: [defaultCountry || null, Validators.required],
      mobile_number: [null],
      activities: this.fb.group(
        {
          day1: [[]],
          day2: [[]],
          day3: [[]]
        },
        { validators: [this.atLeastOneDaySelected()] }
      ),
    });

    /** Apply dynamic validators */
    this.setMobileValidators(
      this.registerForm.get('mobile_number')!,
      defaultCountry?.iso2,
      true
    );
  }

  /** Activities min selected */
  private atLeastOneDaySelected() {
    return (group: AbstractControl): ValidationErrors | null => {
      const day1 = group.get('day1')?.value || [];
      const day2 = group.get('day2')?.value || [];
      const day3 = group.get('day3')?.value || [];

      const anySelected =
        (day1 && day1.length > 0) ||
        (day2 && day2.length > 0) ||
        (day3 && day3.length > 0);

      return anySelected ? null : { noDaysSelected: true };
    };
  }

  /** Dynamically assign validators based on country selection */
  private setMobileValidators(control: AbstractControl, countryIso2?: string, required = false): void {
    const validators = [
      ...(required ? [Validators.required] : []),
      Validators.pattern('^[0-9]*$'),
      Validators.minLength(this.mobileNumberMinLength),
      Validators.maxLength(this.mobileNumberMaxLength),
      this.optionalPhoneValidator(countryIso2),
    ];
    control.setValidators(validators);
  }

  /** Allow empty phone but validate if present */
  private optionalPhoneValidator(countryIso2?: string) {
    return (control: AbstractControl) => {
      if (!control.value) return null;
      const valid = isValidPhoneNumber(String(control.value), countryIso2 as CountryCode);
      return valid ? null : { invalidPhone: true };
    };
  }

  /** Listen to main form changes */
  private handleFormChanges(): void {
    const mobileCtrl = this.registerForm.get('mobile_number')!;
    this.registerForm.get('country_code')!.valueChanges.subscribe((country: Country | null) => {
      if (!country) return;
      this.updatePhoneLength(country.iso2);
      this.setMobileValidators(mobileCtrl, country.iso2, true);
      mobileCtrl.updateValueAndValidity();
    });

    mobileCtrl.valueChanges.subscribe((value) => {
      const country: Country = this.registerForm.get('country_code')!.value;
      if (!country || mobileCtrl.pristine) return;

      const valid = isValidPhoneNumber(String(value), country.iso2 as CountryCode) &&
        String(value).length === this.mobileNumberMaxLength;

      this.invalidPhoneNumber = !valid;
      this.mobileNumberErrorMsg = valid ? '' : 'Invalid phone number.';
    });

    // Listen to each day's selectbutton changes
    const activitiesGroup = this.registerForm.get('activities')!;
    ['day1', 'day2', 'day3'].forEach(day => {
      activitiesGroup.get(day)?.valueChanges.subscribe(() => {
        activitiesGroup.updateValueAndValidity({ onlySelf: true, emitEvent: false });
        this.enforceSlotConstraints();
      });
    });

  }

  /** Dynamic phone length from example number */
  private updatePhoneLength(countryIso2?: string): void {
    if (!countryIso2) return;
    try {
      const example = getExampleNumber(countryIso2 as CountryCode, examples);
      const length = example?.nationalNumber?.length;
      this.mobileNumberMaxLength = length || 15;
    } catch {
      this.mobileNumberMaxLength = 15;
    }
  }

  /** Scroll to first invalid input */
  private scrollToFirstInvalidField(): void {
    const firstInvalidControl: HTMLElement | null = this.el.nativeElement.querySelector(
      'form .ng-invalid.p-component'
    );
    if (firstInvalidControl) {
      const innerInput = firstInvalidControl.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input, textarea, select'
      );
      const focusableElement: HTMLElement = innerInput || firstInvalidControl;
      focusableElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if ('focus' in focusableElement) (focusableElement as HTMLElement).focus({ preventScroll: true });
    }
  }

  /** Submit Form */
  async onSubmit(): Promise<void> {
    this.submitted = true;
    this.loading = true;
    this.submissionError = '';
    this.cd.detectChanges();

    try {
      // // 1) Run reCAPTCHA v3
      // const token = await firstValueFrom(this.recaptchaV3Service.execute('submit'));
      // if (!token) throw new Error('reCAPTCHA failed');

      // // 2) Verify token on server (Edge Function)
      // const verifyResp = await fetch(
      //   'https://blopfvarveykkggbpkfr.supabase.co/functions/v1/recaptcha-verify',
      //   {
      //     method: 'POST',
      //     headers: { 'Content-Type': 'application/json' },
      //     body: JSON.stringify({ token }),
      //   }
      // );

      // const verifyData = await verifyResp.json();
      // if (!verifyResp.ok || !verifyData.success) {
      //   this.submissionError = '[EC-TVF] Verification failed';
      //   this.loading = false;
      //   this.cd.detectChanges();
      //   return;
      // }

      // 3) Process form submission via Edge Function
      await this.processFormSubmission();
    } catch (err: any) {
      this.submissionError = '[EC-GE] ' + (err?.message || 'Unknown error');
    } finally {
      this.loading = false;
      this.scrollToTop();
      this.cd.detectChanges();
    }
  }

  resetForm(): void {
    const defaultCountry = this.getCountryByIso('IN');
    this.initializeForm(defaultCountry);
    this.registrationSuccess = false;
    this.submissionError = '';
    this.submitted = false;
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** NEW: Process submission via Edge Function */
  private async processFormSubmission(): Promise<void> {
    const mainMobile = this.registerForm.get('mobile_number')!;
    const mainCountry: Country | null = this.registerForm.get('country_code')!.value;

    const mainValid =
      mainMobile.value &&
      mainCountry &&
      isValidPhoneNumber(String(mainMobile.value), mainCountry.iso2 as CountryCode) &&
      String(mainMobile.value).length === this.mobileNumberMaxLength;

    if (!mainValid) {
      mainMobile.setErrors({ invalidPhone: true });
      this.invalidPhoneNumber = true;
      this.mobileNumberErrorMsg = 'Invalid phone number.';
      this.registerForm.markAllAsTouched();
      this.scrollToFirstInvalidField();
      return;
    }

    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      this.scrollToFirstInvalidField();
      return;
    }

    /** Prepare payload */
    const mainData = {
      kcdt_member_id: this.registerForm.value.kcdt_member_id,
      full_name: this.registerForm.value.full_name,
      country_code: mainCountry?.iso2,
      mobile_number:
        Number(parsePhoneNumberFromString(String(mainMobile.value), mainCountry.iso2 as CountryCode)?.nationalNumber || mainMobile.value),
      day1: this.registerForm.value.activities.day1,
      day2: this.registerForm.value.activities.day2,
      day3: this.registerForm.value.activities.day3,
    };

    /** Call Edge Function */
    try {
      console.log(mainData)
      const resp = await fetch(environment.gayathriHavanamRegistrationEdgeFunction, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainData }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || 'Registration failed');

      this.registrationSuccess = true;
      this.scrollToTop();
    } catch (err: any) {
      this.submissionError = 'Error saving registration: ' + (err?.message || 'Unknown error');
    }
  }
}
