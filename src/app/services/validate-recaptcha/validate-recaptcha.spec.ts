import { TestBed } from '@angular/core/testing';

import { ValidateRecaptcha } from './validate-recaptcha';

describe('ValidateRecaptcha', () => {
  let service: ValidateRecaptcha;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ValidateRecaptcha);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
