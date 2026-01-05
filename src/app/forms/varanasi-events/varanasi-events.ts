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
  FormArray,
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
import { ButtonModule } from 'primeng/button';
import { PanelModule } from 'primeng/panel';
import { TagModule } from 'primeng/tag';
import { countries } from 'countries-list';

import { environment } from '../../../environments/environment.prod';

import { ValidateMobileNumber } from '../../services/validate-mobile-number/validate-mobile-number';
import { ValidateRecaptcha } from '../../services/validate-recaptcha/validate-recaptcha';

interface Country {
  name: string;
  iso2: string;
  phoneCode: string;
  displayName: string;
}

interface Option {
  name: string;
  value: string;
}

interface Participant {
  registered_on: string;
  kcdt_member_id: number | null;
  full_name: string;
  activities: string[];
  status: boolean;
  mobile_number: string
}

@Component({
  selector: 'app-varanasi-events',
  templateUrl: './varanasi-events.html',
  styleUrls: ['./varanasi-events.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FloatLabelModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    SelectButtonModule,
    ButtonModule,
    PanelModule,
    TagModule
  ],
})
export class VaranasiEvents implements OnInit {
  registerForm!: FormGroup;
  searchForm!: FormGroup;
  countriesList: Country[] = [];
  genderOptions: Option[] = [];
  activityOptions: Option[] = [];
  invalidPhoneNumber = false;
  mobileNumberMinLength = 4;
  mobileNumberMaxLength = 15;
  mobileNumberErrorMsg = 'Invalid mobile number.';
  loading = false;
  registrationSuccess = false;
  submissionError = '';
  submitted = false;
  isMobile = false;

  viewRegistration = true;
  invalidSearchNumber = false
  mainParticipant!: Participant | null;
  accompanyingParticipant!: Participant[];

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
    private el: ElementRef,
    private validateMobileNumber: ValidateMobileNumber,
    private validateRecaptcha: ValidateRecaptcha
  ) { }

  ngOnInit(): void {
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    this.initializeOptions();
    this.prepareCountries();

    const defaultCountry = this.getCountryByIso('IN');
    this.updatePhoneLength(defaultCountry?.iso2);

    this.initializeForm(defaultCountry);
    this.handleFormChanges();
    this.handleSearchFormChanges();
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
    this.genderOptions = [
      { name: 'Male', value: 'Male' },
      { name: 'Female', value: 'Female' },
    ];

    this.activityOptions = [
      { name: 'Day 1 (14 Mar 2026) - Vishnu Sahasra Nama Parayanam', value: 'Day 1 - Vishnu Sahasra Nama Parayanam' },
      { name: 'Day 1 (14 Mar 2026) - Laksha Bilwarchana', value: 'Day 1 - Laksha Bilwarchana' },
      { name: 'Day 2 (15 Mar 2026) - Lalitha Sahasra Nama/Soundaryalahari Parayanam', value: 'Day 2 - Lalitha Sahasra Nama/Soundaryalahari Parayanam' },
      { name: 'Day 2 (15 Mar 2026) - Laksha Rudrakshaarchana & Rudraabhishekam', value: 'Day 2 - Laksha Rudrakshaarchana & Rudraabhishekam' },
      { name: 'Day 3 (16 Mar 2026) - Purnahuti', value: 'Day 3 - Purnahuti' },
    ];
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
      kcdt_member_id: [null],
      full_name: [null, Validators.required],
      country_code: [defaultCountry || null, Validators.required],
      mobile_number: [null],
      gender: ['Male', Validators.required],
      activities: [[], this.minSelectedActivities(1)],
      accompanyingParticipants: this.fb.array([]),
    });

    this.searchForm = this.fb.group({
      country_code: [this.getCountryByIso('IN') || null, Validators.required],
      mobile_number: [null, Validators.required],
    });


  }

  /** Activities min selected */
  private minSelectedActivities(min = 1) {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      return Array.isArray(value) && value.length >= min
        ? null
        : { required: true };
    };
  }

  /** Participants array getter */
  get accompanyingParticipants(): FormArray {
    return this.registerForm.get('accompanyingParticipants') as FormArray;
  }

  /** Add participant row */
  addParticipant(): void {
    const defaultCountry = this.getCountryByIso('IN');

    const participant = this.fb.group({
      kcdt_member_id: [null],
      full_name: [null, Validators.required],
      country_code: [defaultCountry || null],
      mobile_number: [null],
      gender: ['Male', Validators.required],
      activities: [[], this.minSelectedActivities(1)],
    });

    const phoneCtrl = participant.get('mobile_number')!;

    /** Re-run validators on country change */
    participant.get('country_code')!.valueChanges.subscribe((country: Country | null) => {
      if (!country) return;

      // Update max length using the service
      this.mobileNumberMaxLength = this.validateMobileNumber.getPhoneMaxLength(country.iso2);

      // Apply validators using the service
      this.validateMobileNumber.applyMobileValidators(
        phoneCtrl,
        country.iso2,
        false, // participant mobile can be optional
        this.mobileNumberMinLength,
        this.mobileNumberMaxLength
      );

      phoneCtrl.updateValueAndValidity();
    });


    /** participant phone validation on blur */
    phoneCtrl.valueChanges.subscribe((value) => {
      const country = participant.get('country_code')!.value as Country | null;
      if (!country || phoneCtrl.pristine || !value) return;

      const participantMaxLength = this.validateMobileNumber.getPhoneMaxLength(country.iso2);
      const valid = this.validateMobileNumber.isPhoneValid(value, country.iso2, participantMaxLength);

      if (!valid) phoneCtrl.setErrors({ invalidPhone: true });
      else phoneCtrl.setErrors(null);
    });

    this.accompanyingParticipants.push(participant);
  }

  removeParticipant(index: number): void {
    if (window.confirm('Are you sure you want to remove this participant?')) {
      this.accompanyingParticipants.removeAt(index);
    }
  }


  /** Listen to main form changes */
  private handleFormChanges(): void {
    const mobileCtrl = this.registerForm.get('mobile_number')!;
    this.registerForm.get('country_code')!.valueChanges.subscribe((country: Country | null) => {
      if (!country) return;

      this.mobileNumberMaxLength = this.validateMobileNumber.getPhoneMaxLength(country.iso2);

      this.validateMobileNumber.applyMobileValidators(
        mobileCtrl,
        country.iso2,
        true, // main mobile number is required
        this.mobileNumberMinLength,
        this.mobileNumberMaxLength
      );

      mobileCtrl.updateValueAndValidity();
    });


    mobileCtrl.valueChanges.subscribe((value) => {
      const country: Country = this.registerForm.get('country_code')!.value;
      if (!country || mobileCtrl.pristine) return;

      const valid = this.validateMobileNumber.isPhoneValid(
        value,
        country.iso2,
        this.mobileNumberMaxLength
      );

      this.invalidPhoneNumber = !valid;
      this.mobileNumberErrorMsg = valid ? '' : 'Invalid mobile number.';
    });
  }

  /** Dynamic phone length from example number */
  private updatePhoneLength(countryIso2?: string): void {
    if (!countryIso2) return;
    this.mobileNumberMaxLength =
      this.validateMobileNumber.getPhoneMaxLength(countryIso2);
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
    this.cd.detectChanges()

    try {
      const verified = await this.validateRecaptcha.verifyRecaptcha();

      if (!verified) {
        this.submissionError = '[EC-TVF] Verification failed';
        this.loading = false;
        this.cd.detectChanges()
        return;
      }
      await this.processFormSubmission();
    } catch (err: any) {
      this.submissionError = '[EC-GE] ' + (err?.message || 'Unknown error');
      setTimeout(() => {
        this.scrollToTop();
        this.cd.detectChanges();
      }, 0);
    } finally {
      this.loading = false;
      this.cd.detectChanges();
    }
  }

  resetForm(): void {
    this.searchForm.reset();
    this.registerForm.reset();
    const defaultCountry = this.getCountryByIso('IN');
    this.accompanyingParticipants.clear();
    this.initializeForm(defaultCountry);
    this.registrationSuccess = false;
    this.submissionError = '';
    this.submitted = false;
    this.mainParticipant = null;
    this.accompanyingParticipant = [];
  }

  private scrollToTop(): void {
    setTimeout(() => {
      //@ts-ignore
      document.scrollingElement.scrollTop = 0;
    }, 0)
  }

  /** NEW: Process submission via Edge Function */
  private async processFormSubmission(): Promise<void> {
    const mainMobile = this.registerForm.get('mobile_number')!;
    const mainCountry: Country | null = this.registerForm.get('country_code')!.value;

    if (!mainCountry || !mainCountry.iso2) {
      mainMobile.setErrors({ invalidPhone: true });
      this.invalidPhoneNumber = true;
      this.mobileNumberErrorMsg = 'Invalid mobile number.';
      this.registerForm.markAllAsTouched();
      this.scrollToFirstInvalidField();
      return;
    }

    const mainValid = this.validateMobileNumber.isPhoneValid(
      mainMobile.value,
      mainCountry.iso2,
      this.mobileNumberMaxLength
    );

    if (!mainValid) {
      mainMobile.setErrors({ invalidPhone: true });
      this.invalidPhoneNumber = true;
      this.mobileNumberErrorMsg = 'Invalid mobile number.';
      this.registerForm.markAllAsTouched();
      this.scrollToFirstInvalidField();
      return;
    }

    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      this.scrollToFirstInvalidField();
      return;
    }

    /** Validate participant phones */
    let validParticipants = true;
    this.accompanyingParticipants.controls.forEach((p) => {
      const mobileCtrl = p.get('mobile_number')!;
      const country: Country = p.get('country_code')!.value;

      if (mobileCtrl.value && country) {
        const participantMaxLength = this.validateMobileNumber.getPhoneMaxLength(country.iso2);
        if (!this.validateMobileNumber.isPhoneValid(mobileCtrl.value, country.iso2, participantMaxLength)) {
          mobileCtrl.setErrors({ invalidPhone: true });
          validParticipants = false;
        }
      }
    });

    if (!validParticipants) {
      this.scrollToFirstInvalidField();
      return;
    }

    /** Prepare payload */
    const mainData = {
      kcdt_member_id: this.registerForm.value.kcdt_member_id,
      full_name: this.registerForm.value.full_name,
      country_code: mainCountry?.iso2,
      mobile_number: mainMobile.value,
      gender: this.registerForm.value.gender,
      activities: this.registerForm.value.activities,
      status: true
    };

    const accompData = this.accompanyingParticipants.controls.map((p) => {
      let num = p.value.mobile_number;
      const country: Country = p.get('country_code')!.value;

      return {
        kcdt_member_id: p.value.kcdt_member_id,
        full_name: p.value.full_name,
        country_code: country.iso2,
        mobile_number: num,
        gender: p.value.gender,
        activities: p.value.activities,
        status: true
      };
    });

    /** Call Edge Function */
    try {
      const resp = await fetch(environment.registerEdgeFunction, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainData, accompData }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || 'Registration failed');

      this.loading = false;
      this.registrationSuccess = true;
      setTimeout(() => {
        this.scrollToTop();
        this.cd.detectChanges();
      }, 0);
    } catch (err: any) {
      this.submissionError = 'Error saving registration: ' + (err?.message || 'Unknown error');
    }
  }


  private handleSearchFormChanges(): void {
    const mobileCtrl = this.searchForm.get('mobile_number')!;

    // Update validators when country changes
    this.searchForm.get('country_code')!.valueChanges.subscribe((country: Country | null) => {
      if (!country) return;

      this.mobileNumberMaxLength = this.validateMobileNumber.getPhoneMaxLength(country.iso2);

      this.validateMobileNumber.applyMobileValidators(
        mobileCtrl,
        country.iso2,
        true,
        this.mobileNumberMinLength,
        this.mobileNumberMaxLength
      );

      mobileCtrl.updateValueAndValidity();
    });

    // Real-time validation
    mobileCtrl.valueChanges.subscribe((value) => {
      const country: Country = this.searchForm.get('country_code')!.value;
      if (!country || mobileCtrl.pristine) return;

      const valid = this.validateMobileNumber.isPhoneValid(
        value,
        country.iso2,
        this.mobileNumberMaxLength
      );

      this.invalidSearchNumber = !valid;
      this.mobileNumberErrorMsg = valid ? '' : 'Invalid mobile number.';
    });
  }

  async searchRegistration(mobile_number?: string): Promise<void> {

    this.submissionError = '';

    let mobileNumber = mobile_number;
    let mobileCtrl;
    let countryCtrl;

    if (!mobileNumber) {
      if (!this.searchForm) return;

      mobileCtrl = this.searchForm.get('mobile_number')!;
      countryCtrl = this.searchForm.get('country_code')!;

      // Validate country
      if (!countryCtrl.value || !countryCtrl.value.iso2) {
        mobileCtrl.setErrors({ invalidPhone: true });
        this.invalidSearchNumber = true;
        this.mobileNumberErrorMsg = 'Invalid mobile number.';
        this.searchForm.markAllAsTouched();
        this.scrollToFirstInvalidField();
        return;
      }

      // Validate mobile number
      const valid = this.validateMobileNumber.isPhoneValid(
        mobileCtrl.value,
        countryCtrl.value.iso2,
        this.validateMobileNumber.getPhoneMaxLength(countryCtrl.value.iso2)
      );

      if (!valid) {
        mobileCtrl.setErrors({ invalidPhone: true });
        this.invalidSearchNumber = true;
        this.mobileNumberErrorMsg = 'Invalid mobile number.';
        this.searchForm.markAllAsTouched();
        this.scrollToFirstInvalidField();
        return;
      }

      this.invalidSearchNumber = false;
      this.mobileNumberErrorMsg = '';
      this.loading = true;
    }

    try {

      const verified = await this.validateRecaptcha.verifyRecaptcha();
      if (!verified) {
        this.submissionError = 'reCAPTCHA verification failed';
        this.loading = false;
        this.cd.detectChanges()
        return;
      }

      const payload = {
        mobile_number: mobileNumber ? mobileNumber : mobileCtrl?.value,
        action: null,
      };

      const resp = await fetch(environment.searchEdgeFunction, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await resp.json();

      if (!resp.ok || !data.success) {
        setTimeout(() => {
          this.scrollToTop();
          this.cd.detectChanges();
        }, 0);
        throw new Error(data.error || 'Participant not found');
      }

      // You now have participant data
      this.mainParticipant = data.primaryParticipant
      this.accompanyingParticipant = data.accompParticipants
      this.loading = false;

      this.cd.detectChanges()

    } catch (err: any) {
      this.submissionError = 'Search failed: ' + (err?.message || 'Unknown error');
    } finally {
      this.loading = false;
      setTimeout(() => {
        this.scrollToTop();
        this.cd.detectChanges();
      }, 0);
    }
  }

  /** Withdraw participant */
  async withdrawRegistration(): Promise<void> {

    this.submissionError = '';

    if (!this.searchForm || !this.mainParticipant) return;

    const confirmed = window.confirm(
      `Withdrawing your participation will also remove all accompanying members. Are you sure you want to continue?`
    );
    if (!confirmed) return;

    this.loading = true;

    try {
      // eCAPTCHA verification
      const verified = await this.validateRecaptcha.verifyRecaptcha();
      if (!verified) {
        this.submissionError = 'reCAPTCHA verification failed';
        this.loading = false;
        this.cd.detectChanges()
        return;
      }

      const payload = {
        mobile_number: this.mainParticipant.mobile_number,
        action: "withdraw",
      };

      const resp = await fetch(environment.searchEdgeFunction, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        setTimeout(() => {
          this.scrollToTop();
          this.cd.detectChanges();
        }, 0); throw new Error(data.error || 'Withdrawal failed')
      };

      this.mainParticipant.status = false;
      this.loading = false;
      this.cd.detectChanges()

    } catch (err: any) {
      this.submissionError = 'Withdrawal failed: ' + (err?.message || 'Unknown error');
    } finally {
      this.loading = false;
      setTimeout(() => {
        this.scrollToTop();
        this.cd.detectChanges();
      }, 0);
    }
  }

}
