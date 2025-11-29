import { TestBed } from '@angular/core/testing';

import { GayathriHavanamRegistrations } from './gayathri-havanam-registrations';

describe('GayathriHavanamRegistrations', () => {
  let service: GayathriHavanamRegistrations;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GayathriHavanamRegistrations);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
