import {
  Component,
  ChangeDetectorRef,
  ElementRef,
  OnInit
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  FormControl,
  AbstractControl,
  ValidationErrors
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { FloatLabelModule } from 'primeng/floatlabel';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { PanelModule } from 'primeng/panel';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { TagModule } from 'primeng/tag';

import { countries } from 'countries-list';
import { environment } from '../../../../environments/environment.prod';

import { ValidateMobileNumber } from '../../../services/validate-mobile-number/validate-mobile-number';
import { ValidateRecaptcha } from '../../../services/validate-recaptcha/validate-recaptcha';

/* ======================= INTERFACES ======================= */

interface Country {
  name: string;
  iso2: string;
  phoneCode: string;
  displayName: string;
}

interface Participant {
  registered_on: string;
  kcdt_member_id: number | null;
  full_name: string;
  activities: string[];
  status: boolean;
  mobile_number: string;
}

interface Option {
  id: number;
  day: number;
  slot_time: string;
  max_capacity: number;
  registration_count: number;
  disabled?: boolean;
}

/* ======================= COMPONENT ======================= */

@Component({
  selector: 'app-vishnu-sahasra-nama-parayana',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FloatLabelModule,
    InputNumberModule,
    SelectModule,
    SelectButtonModule,
    PanelModule,
    ButtonModule,
    CheckboxModule,
    TagModule
  ],
  templateUrl: './vishnu-sahasra-nama-parayana.html',
  styleUrl: './vishnu-sahasra-nama-parayana.scss',
})
export class VishnuSahasraNamaParayana implements OnInit {

  /* ======================= FORMS ======================= */
  searchForm!: FormGroup;
  primarySlots!: FormGroup;
  accompanyingSlots: FormGroup[] = [];
  applyToAllAccompanying = new FormControl(true);

  /* ======================= DATA ======================= */
  countriesList: Country[] = [];
  day1Slots: Option[] = [];
  day2Slots: Option[] = [];

  mainParticipant: Participant | null = null;
  accompanyingParticipant: Participant[] = [];

  /* ======================= UI ======================= */
  isMobile = false;
  submissionError = '';
  registrationSuccess = false;
  searching = false;
  saving = false;
  slotsSubmitted = false;

  yesNoOptions = [
    { label: 'Yes', value: true },
    { label: 'No', value: false }
  ];

  /* ======================= PHONE ======================= */
  mobileNumberMinLength = 4;
  mobileNumberMaxLength = 15;
  mobileNumberErrorMsg = '';
  invalidSearchNumber = false;

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
    private el: ElementRef,
    private validateMobileNumber: ValidateMobileNumber,
    private validateRecaptcha: ValidateRecaptcha
  ) { }

  ngOnInit(): void {
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    this.prepareCountries();
    this.initializeSearchForm();
    this.handleSearchFormChanges();
    this.loadSlotsAvailability();
  }

  /* ======================= VALIDATORS ======================= */

  private atLeastOneSlotValidator(control: AbstractControl): ValidationErrors | null {
    const day1 = control.get('day1')?.value || [];
    const day2 = control.get('day2')?.value || [];
    return (day1.length || day2.length) ? null : { noDaysSelected: true };
  }

  /* ======================= COUNTRIES ======================= */

  private prepareCountries(): void {
    this.countriesList = Object.entries(countries).map(([iso2, data]) => ({
      name: data.name,
      iso2,
      phoneCode: String(data.phone?.[0] || ''),
      displayName: `${data.name} (+${String(data.phone?.[0] || '')})`,
    }));
  }

  private getCountryByIso(iso2: string): Country | undefined {
    return this.countriesList.find(c => c.iso2 === iso2);
  }

  /* ======================= SEARCH FORM ======================= */

  private initializeSearchForm(): void {
    const defaultCountry = this.getCountryByIso('IN');

    this.searchForm = this.fb.group({
      country_code: [defaultCountry || null, Validators.required],
      mobile_number: [null, Validators.required],
    });

    if (defaultCountry) {
      this.mobileNumberMaxLength =
        this.validateMobileNumber.getPhoneMaxLength(defaultCountry.iso2);
    }
  }

  private handleSearchFormChanges(): void {
    const mobileCtrl = this.searchForm.get('mobile_number')!;

    this.searchForm.get('country_code')!.valueChanges.subscribe((country: Country) => {
      if (!country) return;

      this.mobileNumberMaxLength =
        this.validateMobileNumber.getPhoneMaxLength(country.iso2);

      this.validateMobileNumber.applyMobileValidators(
        mobileCtrl,
        country.iso2,
        true,
        this.mobileNumberMinLength,
        this.mobileNumberMaxLength
      );
    });

    mobileCtrl.valueChanges.subscribe(value => {
      const country = this.searchForm.get('country_code')!.value;
      if (!country || mobileCtrl.pristine) return;

      const valid = this.validateMobileNumber.isPhoneValid(
        value,
        country.iso2,
        this.mobileNumberMaxLength
      );

      this.invalidSearchNumber = !valid;
      this.mobileNumberErrorMsg = valid ? '' : 'Invalid mobile number';
    });
  }

  /* ======================= SLOTS ======================= */

  async loadSlotsAvailability(): Promise<void> {
    const resp = await fetch(environment.vsnpSlotsEdgeFunction);
    const data = await resp.json();

    const slots: Option[] = data.slots;

    this.day1Slots = slots
      .filter(s => s.day === 1)
      .map(s => ({ ...s, disabled: s.max_capacity === s.registration_count }));

    this.day2Slots = slots
      .filter(s => s.day === 2)
      .map(s => ({ ...s, disabled: s.max_capacity === s.registration_count }));
  }

  /* ======================= SEARCH ======================= */

  async searchRegistration(): Promise<void> {
    if (this.searching) return;

    this.submissionError = '';
    this.invalidSearchNumber = false;
    this.searchForm.markAllAsTouched();

    if (this.searchForm.invalid) return;

    const mobileCtrl = this.searchForm.get('mobile_number')!;
    const country = this.searchForm.get('country_code')!.value;

    if (!this.validateMobileNumber.isPhoneValid(
      mobileCtrl.value,
      country.iso2,
      this.mobileNumberMaxLength
    )) {
      this.invalidSearchNumber = true;
      this.mobileNumberErrorMsg = 'Invalid phone number.';
      return;
    }

    this.searching = true;

    try {
      const resp = await fetch(environment.searchEdgeFunction, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile_number: mobileCtrl.value }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Participant not found');
      }

      this.mainParticipant = data.mainParticipant;
      this.accompanyingParticipant = data.accompParticipants;

      this.initParticipantSlots();
    } catch (err: any) {
      this.submissionError = err.message || 'Search failed';
    } finally {
      this.searching = false;
      this.cd.detectChanges();
    }
  }

  /* ======================= SLOT FORMS ======================= */

  private initParticipantSlots(): void {
    this.primarySlots = this.fb.group({
      activities: this.fb.group(
        { day1: [[]], day2: [[]] },
        { validators: this.atLeastOneSlotValidator }
      ),
    });

    this.accompanyingSlots = this.accompanyingParticipant.map(() =>
      this.fb.group({
        copyFromPrimary: [true],
        activities: this.fb.group(
          { day1: [[]], day2: [[]] },
          { validators: this.atLeastOneSlotValidator }
        ),
      })
    );

    /* 🔹 APPLY TO ALL TOGGLE */
    this.applyToAllAccompanying.valueChanges.subscribe(val => {
      if (val === false) {
        this.clearAllAccompanyingSlots();
      } else {
        this.accompanyingSlots.forEach(g =>
          g.get('copyFromPrimary')!.setValue(true, { emitEvent: true })
        );
      }
    });

    /* 🔹 PER PARTICIPANT COPY */
    this.accompanyingSlots.forEach(grp => {
      grp.get('copyFromPrimary')!.valueChanges.subscribe(copy => {
        const activities = grp.get('activities')!;
        if (copy) {
          activities.patchValue(this.primarySlots.get('activities')!.value, { emitEvent: false });
          activities.disable({ emitEvent: false });
        } else {
          activities.enable({ emitEvent: false });
        }
      });
    });

    /* 🔹 SYNC PRIMARY → ACCOMPANYING */
    this.primarySlots.get('activities')!.valueChanges.subscribe(value => {
      this.accompanyingSlots.forEach(grp => {
        if (grp.get('copyFromPrimary')!.value) {
          grp.get('activities')!.patchValue(value, { emitEvent: false });
        }
      });
    });
  }

  /* ✅ NEW: CLEAR ACCOMPANYING WHEN APPLY = NO */
  private clearAllAccompanyingSlots(): void {
    this.accompanyingSlots.forEach(form => {
      form.get('copyFromPrimary')?.setValue(false, { emitEvent: false });
      form.get('activities.day1')?.setValue([], { emitEvent: false });
      form.get('activities.day2')?.setValue([], { emitEvent: false });

      form.markAsPristine();
      form.markAsUntouched();
      form.updateValueAndValidity({ emitEvent: false });
    });
  }

  /* ======================= SUBMIT ======================= */

  submitSlots(): void {
    if (this.saving) return;

    this.slotsSubmitted = true;
    this.saving = true;
    this.submissionError = '';

    this.primarySlots.markAllAsTouched();
    this.accompanyingSlots.forEach(g => g.markAllAsTouched());

    if (!this.primarySlots.valid) {
      this.saving = false;
      return;
    }

    try {
      const payload: any[] = [];

      const primaryActivities = this.primarySlots.getRawValue().activities;

      payload.push({
        id: this.mainParticipant?.kcdt_member_id ?? null,
        full_name: this.mainParticipant?.full_name,
        day1: primaryActivities.day1,
        day2: primaryActivities.day2,
      });

      this.accompanyingParticipant.forEach((p, i) => {
        const activities = this.accompanyingSlots[i].getRawValue().activities;
        payload.push({
          id: p.kcdt_member_id ?? null,
          full_name: p.full_name,
          day1: activities.day1,
          day2: activities.day2,
        });
      });

      console.log('Final payload:', payload);
    } catch (err: any) {
      this.submissionError = err.message || 'Failed to save slots';
    } finally {
      this.saving = false;
      this.cd.detectChanges();
    }
  }

  hasSlotError(form: FormGroup): boolean {
    const activities = form.get('activities');
    return this.slotsSubmitted && !!activities && activities.hasError('noDaysSelected');
  }

  resetForm(): void {
    this.mainParticipant = null;
    this.accompanyingParticipant = [];
    this.initializeSearchForm();
  }
}
