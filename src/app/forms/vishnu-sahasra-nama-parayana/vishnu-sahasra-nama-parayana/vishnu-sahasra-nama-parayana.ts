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
  id: number;
  registered_on: string;
  kcdt_member_id: number | null;
  full_name: string;
  activities: string[];
  status: boolean;
  country_code: string;
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

interface SlotSummaryRow {
  full_name: string;
  day1: string;
  day2: string;
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
  existingRegistrations: SlotSummaryRow[] = [];

  /* ======================= DATA ======================= */
  countriesList: Country[] = [];
  day1Slots: Option[] = [];
  day2Slots: Option[] = [];
  noSlotsAvailable: boolean = false;

  mainParticipant: Participant | null = null;
  accompanyingParticipant: Participant[] = [];

  /* ======================= UI ======================= */
  submissionError = '';
  registrationSuccess = false;
  searching = false;
  saving = false;
  slotsSubmitted = false;
  isMobile = false;

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

  /* ======================= CAPTCHA ======================= */

  private async runCaptcha(): Promise<boolean> {
    try {
      const verified = await this.validateRecaptcha.verifyRecaptcha();
      if (!verified) {
        this.submissionError = '[EC-TVF] Verification failed';
        this.cd.detectChanges();
        return false;
      }
      return true;
    } catch (err: any) {
      this.submissionError = '[EC-GE] ' + (err?.message || 'Captcha error');
      this.cd.detectChanges();
      return false;
    }
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

    this.day1Slots = slots.filter(s => s.day === 1)
      .map(s => ({ ...s, disabled: s.max_capacity === s.registration_count }));

    this.day2Slots = slots.filter(s => s.day === 2)
      .map(s => ({ ...s, disabled: s.max_capacity === s.registration_count }));

    this.noSlotsAvailable =
      [...this.day1Slots, ...this.day2Slots].every(s => s.disabled === true);
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
      this.mobileNumberErrorMsg = 'Invalid mobile number.';
      return;
    }

    this.searching = true;
    this.cd.detectChanges();

    if (!(await this.runCaptcha())) {
      this.searching = false;
      return;
    }

    try {
      const resp = await fetch(environment.searchEdgeFunction, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile_number: mobileCtrl.value }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.message || 'Participant not found');
      }

      this.mainParticipant = data.mainParticipant;
      this.accompanyingParticipant = data.accompParticipants;
      this.existingRegistrations = data.existingRegistrations || [];
      this.initParticipantSlots();

    } catch (err: any) {
      this.submissionError = err.message || 'Search failed';
      this.scrollToTop();
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
        activities: this.fb.group(
          { day1: [[]], day2: [[]] },
          { validators: this.atLeastOneSlotValidator }
        ),
      })
    );

    // Sync primary → accompanying when "Apply to all" is YES
    this.primarySlots.get('activities')!.valueChanges.subscribe(value => {
      if (!this.applyToAllAccompanying.value) return;

      this.accompanyingSlots.forEach(g => {
        g.get('activities')!.patchValue(value, { emitEvent: false });
      });
    });

    this.applyToAllAccompanying.valueChanges.subscribe(applyAll => {
      if (applyAll) {
        // YES → copy primary slots to all
        const primary = this.primarySlots.get('activities')!.value;
        this.accompanyingSlots.forEach(g => {
          g.get('activities')!.patchValue(primary, { emitEvent: false });
        });
      } else {
        // NO → clear accompanying slots for manual selection
        this.accompanyingSlots.forEach(g => {
          g.get('activities')!.reset(
            { day1: [], day2: [] },
            { emitEvent: false }
          );
        });
      }
    });

  }

  /* ======================= SUBMIT ======================= */

  async submitSlots(): Promise<void> {
    if (this.noSlotsAvailable) {
      await this.submitWaitlist();
    } else {
      await this.submitRegistrations();
    }
  }

  private async submitWaitlist(): Promise<void> {
    if (this.saving) return;

    this.saving = true;
    this.submissionError = '';

    /** Prepare payload */
    const mainData = {
      kcdt_member_id: this.mainParticipant?.kcdt_member_id,
      full_name: this.mainParticipant?.full_name,
      country_code: this.mainParticipant?.country_code,
      mobile_number: this.mainParticipant?.mobile_number,
    };

    try {
      const resp = await fetch(environment.vsnpWaitlists, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainData }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        const errorMsg = data.message || data.error || 'Registration failed';
        throw new Error(errorMsg);
      }
      this.scrollToTop();
      this.registrationSuccess = true;
    } catch (err: any) {
      this.scrollToTop();
      this.submissionError =
        'Error joining waitlist. ' + (err?.message || 'Unknown error');
    } finally {
      this.scrollToTop();
      this.saving = false;
      this.cd.detectChanges();
    }
  }

  async submitRegistrations(): Promise<void> {
    if (this.saving) return;

    this.slotsSubmitted = true;
    this.saving = true;
    this.submissionError = '';
    this.primarySlots.markAllAsTouched();

    if (!this.applyToAllAccompanying.value) {
      this.accompanyingSlots.forEach(g => g.markAllAsTouched());
    }

    const primaryInvalid = this.primarySlots.invalid;

    const accompanyingInvalid =
      !this.applyToAllAccompanying.value &&
      this.accompanyingSlots.some(g => g.invalid);

    if (primaryInvalid || accompanyingInvalid) {
      this.saving = false;
      this.cd.detectChanges();
      return;
    }

    this.cd.detectChanges();

    if (!(await this.runCaptcha())) {
      this.saving = false;
      return;
    }

    if (this.applyToAllAccompanying.value) {
      const primary = this.primarySlots.getRawValue().activities;
      this.accompanyingSlots.forEach(g => {
        g.get('activities')!.setValue(primary, { emitEvent: false });
      });
    }

    try {
      const payload: any[] = [];
      const primary = this.primarySlots.getRawValue().activities;
      payload.push({
        kcdt_member_id: this.mainParticipant?.kcdt_member_id,
        source_reference: this.mainParticipant?.id,
        full_name: this.mainParticipant?.full_name,
        country_code: this.mainParticipant?.country_code,
        mobile_number: this.mainParticipant?.mobile_number,
        day1: primary.day1,
        day2: primary.day2
      });

      this.accompanyingParticipant.forEach((p, i) => {
        const a = this.accompanyingSlots[i].getRawValue().activities;
        payload.push({
          kcdt_member_id: p?.kcdt_member_id,
          source_reference: p?.id,
          full_name: p?.full_name,
          country_code: p?.country_code,
          mobile_number: p?.mobile_number,
          day1: a.day1,
          day2: a.day2
        });
      });

      const resp = await fetch(environment.vsnpRegistrationsEdgeFunction, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainData: payload }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        const errorMsg = data.message || data.error || 'Slot saving failed';
        throw new Error(errorMsg);
      }

      this.scrollToTop();
      this.registrationSuccess = true;

    } catch (err: any) {
      this.submissionError = err.message || 'Failed to save slots';
      this.scrollToTop();
    } finally {
      this.scrollToTop();
      this.saving = false;
      this.cd.detectChanges();
    }
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }


  hasSlotError(form: FormGroup): boolean {
    return (
      this.slotsSubmitted === true &&
      form.get('activities')?.hasError('noDaysSelected') === true
    );
  }

  /* ======================= RESET ======================= */

  resetForm(): void {
    // Clear participants
    this.mainParticipant = null;
    this.accompanyingParticipant = [];
    this.existingRegistrations = [];

    // Clear slot forms + validation state
    this.primarySlots = undefined as any;
    this.accompanyingSlots = [];
    this.slotsSubmitted = false;

    // Clear UI state
    this.registrationSuccess = false;
    this.submissionError = '';

    // Reset search form but keep country default
    const defaultCountry = this.getCountryByIso('IN');
    this.searchForm.reset({
      country_code: defaultCountry || null,
      mobile_number: null,
    });

    this.invalidSearchNumber = false;
    this.mobileNumberErrorMsg = '';

    this.cd.detectChanges();
  }


  private mapSlotIdsToTimes(slotIds: number[], slots: Option[]): string {
    if (!slotIds || slotIds.length === 0) {
      return '-';
    }

    return slots
      .filter(s => slotIds.includes(s.id))
      .map(s => s.slot_time)
      .join(', ');
  }



  get slotSummary(): SlotSummaryRow[] {
    if (!this.mainParticipant || !this.primarySlots) {
      return [];
    }

    const rows: SlotSummaryRow[] = [];

    // Main participant
    const primaryActivities = this.primarySlots.getRawValue().activities;

    rows.push({
      full_name: this.mainParticipant.full_name,
      day1: this.mapSlotIdsToTimes(primaryActivities.day1, this.day1Slots),
      day2: this.mapSlotIdsToTimes(primaryActivities.day2, this.day2Slots),
    });

    // Accompanying participants
    this.accompanyingParticipant.forEach((p, i) => {
      const activities = this.accompanyingSlots[i]
        ?.getRawValue()
        ?.activities;

      rows.push({
        full_name: p.full_name,
        day1: this.mapSlotIdsToTimes(activities?.day1, this.day1Slots),
        day2: this.mapSlotIdsToTimes(activities?.day2, this.day2Slots),
      });
    });

    return rows;
  }

  get hasVsnpRegistrations(): boolean {
    return this.existingRegistrations.length > 0;
  }

  printSummary(): void {
    window.print();
  }
}
