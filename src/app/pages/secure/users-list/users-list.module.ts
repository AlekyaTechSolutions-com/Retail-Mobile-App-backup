import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { UsersListPageRoutingModule } from './users-list-routing.module';
import { UsersListPage } from './users-list.page';

@NgModule({
  declarations: [
    UsersListPage   // ✅ keep only non-standalone here
  ],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    UsersListPageRoutingModule
  ]
})
export class UsersListPageModule {}