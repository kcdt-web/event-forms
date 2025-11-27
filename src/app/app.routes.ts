import { Routes } from '@angular/router';

import { VaranasiEvents } from './forms/varanasi-events/varanasi-events';
import { GayathriHavanam } from './forms/gayathri-havanam/gayathri-havanam';
import { SearchRegistration } from './forms/search-registration/search-registration';

export const routes: Routes = [
    {
        path: 'gayathri-havanam-registrations',
        component: GayathriHavanam,
    },
    {
        path: 'varanasi-event-registrations',
        component: VaranasiEvents,
        children: [{
            path: 'search',
            component: SearchRegistration
        }]
    },
    {
        path: '',
        redirectTo: 'varanasi-event-registrations',
        pathMatch: 'full'
    }
];
