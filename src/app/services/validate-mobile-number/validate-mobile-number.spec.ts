import { TestBed } from '@angular/core/testing';

import { ValidateMobileNumber } from './validate-mobile-number';

describe('ValidateMobileNumber', () => {
  let service: ValidateMobileNumber;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ValidateMobileNumber);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
