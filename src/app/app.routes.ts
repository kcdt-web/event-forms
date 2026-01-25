import { Routes } from '@angular/router';

import { VaranasiEvents } from './forms/varanasi-events/varanasi-events';
import { VaranasiEventsSpl } from './forms/varanasi-events-spl/varanasi-events';
import { GayathriHavanam } from './forms/gayathri-havanam/gayathri-havanam/gayathri-havanam';
import { VishnuSahasraNamaParayana } from './forms/vishnu-sahasra-nama-parayana/vishnu-sahasra-nama-parayana/vishnu-sahasra-nama-parayana';

export const routes: Routes = [
    {
        path: 'gayathri-havanam-registrations',
        component: GayathriHavanam,
    },
    {
        path: 'vishnu-sahasra-nama-parayana',
        component: VishnuSahasraNamaParayana
    },
    {
        path: 'varanasi-event-registrations',
        component: VaranasiEvents,
    },
    {
        path: 'varanasi-event-spl-registrations',
        component: VaranasiEventsSpl,
    },
    {
        path: '',
        redirectTo: 'varanasi-event-registrations',
        pathMatch: 'full'
    }
];
