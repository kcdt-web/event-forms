import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VishnuSahasraNamaParayana } from './vishnu-sahasra-nama-parayana';

describe('VishnuSahasraNamaParayana', () => {
  let component: VishnuSahasraNamaParayana;
  let fixture: ComponentFixture<VishnuSahasraNamaParayana>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VishnuSahasraNamaParayana]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VishnuSahasraNamaParayana);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
