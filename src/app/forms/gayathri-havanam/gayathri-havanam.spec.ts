import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GayathriHavanam } from './gayathri-havanam';

describe('GayathriHavanam', () => {
  let component: GayathriHavanam;
  let fixture: ComponentFixture<GayathriHavanam>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GayathriHavanam]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GayathriHavanam);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
