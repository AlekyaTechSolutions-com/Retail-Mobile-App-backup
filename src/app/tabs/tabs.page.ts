import { Component } from '@angular/core';
import { ActionSheetController } from '@ionic/angular';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';
import { Platform, IonRouterOutlet } from '@ionic/angular';
import { ViewChild } from '@angular/core';

 
@Component({
    selector: 'app-tabs',
    templateUrl: 'tabs.page.html',
    styleUrls: ['tabs.page.scss'],
    standalone: false
})
export class TabsPage {
 

isOpen = false;
 
toggle() {
  this.isOpen = !this.isOpen;
}

  hideTabBar: boolean = false;
 
  constructor(
  private navCtrl: NavController,
  private actionSheetController: ActionSheetController,
  private router: Router,
  private platform: Platform
) {

  // ✅ BACK BUTTON LOGIC
  this.platform.backButton.subscribeWithPriority(10, () => {

    if (this.router.url === '/tabs/home') {
      (navigator as any).app?.exitApp();
    } else {
      this.navCtrl.back();
    }

  });

  // existing logic
  this.router.events.subscribe(() => {

    const url = this.router.url;

    this.isOpen = false;

    this.hideTabBar =
      url.includes('/tabs/profile') ||
      url.includes('/tabs/edit') ||
      url.includes('/tabs/charts') ||
      url.includes('/tabs/payments') ||
      url.includes('/tabs/coupons') ||
      url.includes('/tabs/devices') ||
      url.startsWith('/tabs/address') ||
      url.startsWith('/tabs/change-password');

  });

}
  // Select action
  async selectAction() {

    const actionSheet = await this.actionSheetController.create({
      header: 'Choose an action',
      cssClass: 'custom-action-sheet',
      buttons: [
        {
          text: 'Add something',
          icon: 'wallet',
          handler: () => {
            // Put in logic ...
          }
        },
        {
          text: 'Change something',
          icon: 'swap-horizontal-outline',
          handler: () => {
            // Put in logic ...
          }
        },
        {
          text: 'Set something',
          icon: 'calculator',
          handler: () => {
            // Put in logic ...
          }
        }, {
          text: 'Cancel',
          icon: 'close',
          role: 'cancel'
        }]
    });
    await actionSheet.present();
  }
  goToAddProduct() {
    this.isOpen = false;
    this.router.navigate(['products/add']);
  }

  goToAddCoupon() {
  this.isOpen = false;

  this.navCtrl.navigateForward('/tabs/coupons/add-coupon', {
    state: {
      autoOpenCreate: true
    }
  });
}

// closeFab() {
//   this.isOpen = false;
// }  


//   async openAddEmployee() {
//   const modal = await this.modalCtrl.create({
//     component: AddUserComponent,
//     cssClass: 'add-user-modal'
//   });

//   await modal.present();
// }
}