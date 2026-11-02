import { Component, OnInit } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { AuthService } from 'src/app/services/auth/auth.service';
import { NavController } from '@ionic/angular';

@Component({
    selector: 'app-vendors',
    templateUrl: './vendors.page.html',
    styleUrls: ['./vendors.page.scss'],
    standalone: false
})
export class VendorsPage implements OnInit {

  page = 1;
  perPage = 10;
  hasMore = true;
  loading = false;
  loadError = '';
  private vendorRequestId = 0;
  private vendorMerchantId = '';
  private vendorSearch = '';

  vendors: any[] = [];
  filteredVendors: any[] = [];
  mappedVendors: Array<{ vendorId: string; mappingId: string }> = [];
  selectedStoreName = '';
  assignmentMode = false;
  savingAssignments = new Set<string>();
  popupShown= false;
accentColors: string[] = [
    '#d1c876', // yellow
    '#de667c', // green
    '#6ac2c3', // red
    '#db8366', // teal
    '#66a8de'  // blue
  ];

  constructor(
    private alertCtrl: AlertController,
    private authService: AuthService,
    private navCtrl: NavController,
    private toastCtrl: ToastController
  ) {}
goBack() {
  this.navCtrl.navigateBack('/tabs/home');
}
  
  ngOnInit() {
    this.resetAndLoad();
  }

  /* ---------------- LOAD VENDORS ---------------- */

  ionViewWillEnter() { void this.loadVendors(); }

  async loadVendors(event?: any) {
    let merchantId = '';
    try { merchantId = JSON.parse(localStorage.getItem('merchant_data') || 'null')?.id || ''; } catch {}
    if (this.loading && merchantId === this.vendorMerchantId) { event?.target?.complete(); return; }
    const requestId = ++this.vendorRequestId;
    this.vendorMerchantId = merchantId;
    this.loading = true;
    this.loadError = '';
    this.vendors = [];
    this.filteredVendors = [];
    try {
      const storeId = JSON.parse(localStorage.getItem('selected_store') || 'null')?.id || '';
      const [vendors, mappings] = await Promise.all([
        this.authService.getPchVendors(merchantId),
        this.authService.getPchStoreVendorMappings(storeId)
      ]);
      if (requestId !== this.vendorRequestId) return;
      this.vendors = vendors;
      this.mappedVendors = mappings;
      const store = JSON.parse(localStorage.getItem('selected_store') || 'null');
      this.selectedStoreName = store?.name || store?.store_name || 'Selected store';
      this.filterVendors();
      this.hasMore = false;
    } catch (error: any) {
      if (requestId === this.vendorRequestId) this.loadError = error?.message || 'Unable to load vendors. Please try again.';
    } finally {
      if (requestId === this.vendorRequestId) this.loading = false;
      event?.target?.complete();
    }
  }

  search(event: any) {
    this.vendorSearch = String(event.target.value || '').trim().toLowerCase();
    this.filterVendors();
  }

  private filterVendors() {
    this.filteredVendors = this.vendors.filter(vendor => !this.vendorSearch ||
      [vendor.vendor_name, vendor.vendor_code, vendor.contact_person, vendor.phone, vendor.email]
        .some(value => String(value || '').toLowerCase().includes(this.vendorSearch)));
  }

  /* ---------------- AVATAR COLOR ---------------- */
  getAccentColor(index: number): string {
    return this.accentColors[index % this.accentColors.length];
  }

  toggleAssignmentMode() { this.assignmentMode = !this.assignmentMode; }

  vendorId(vendor: any): string { return String(vendor?.vendorId || vendor?.id || vendor?.vendor_id || ''); }

  isMapped(vendor: any): boolean { return this.mappedVendors.some(item => item.vendorId === this.vendorId(vendor)); }

  async toggleStoreMapping(vendor: any, event: Event) {
    const input = event.target as HTMLInputElement;
    const id = this.vendorId(vendor);
    const mapping = this.mappedVendors.find(item => item.vendorId === id);
    if (!id || this.savingAssignments.size) { input.checked = !!mapping; return; }
    this.savingAssignments = new Set(this.savingAssignments).add(id);
    try {
      const storeId = JSON.parse(localStorage.getItem('selected_store') || 'null')?.id || '';
      if (input.checked) {
        const response = await this.authService.mapPchVendorToStore(storeId, id);
        const created = response?.mapping || response?.data?.mapping || response?.data || response;
        const newMappingId = String(created?.mappingId || created?.mapping_id || created?.id || created?._id || '');
        this.mappedVendors = [...this.mappedVendors, { vendorId: id, mappingId: newMappingId }];
      } else {
        await this.authService.unmapPchVendorFromStore(storeId, id, mapping?.mappingId);
        this.mappedVendors = this.mappedVendors.filter(item => item.vendorId !== id);
      }
      const toast = await this.toastCtrl.create({ message: input.checked ? 'Vendor mapped to this store' : 'Vendor unmapped from this store', duration: 1600, position: 'bottom', color: 'success' });
      await toast.present();
    } catch (error: any) {
      input.checked = !!mapping;
      const toast = await this.toastCtrl.create({ message: error?.message || 'Unable to update vendor assignment', duration: 2500, position: 'bottom', color: 'danger' });
      await toast.present();
    } finally {
      const pending = new Set(this.savingAssignments); pending.delete(id); this.savingAssignments = pending;
    }
  }

  /* ---------------- RESET ---------------- */

  resetAndLoad() {
    this.page = 1;
    this.hasMore = true;
    this.vendors = [];
    this.filteredVendors = [];
    this.loadVendors();
  }

  async checktoken() {
    
  const token = localStorage.getItem('user_data') ? JSON.parse(localStorage.getItem('user_data')!).token : null;

    if (!token || token === 'undefined' || token === 'null') {

      await this.showLogoutPopup();

      return false;
    }

    try {

      const res: any = await this.authService.validateuser(token);
      if (
        res?.valid === 'false' ||
        res?.valid === false ||
        res?.valid === '0' ||
        res?.valid === 0
      ) {

        await this.showLogoutPopup();

        return false;
      }

      // TOKEN VALID
      if (res?.valid) {
        return true;
      }

      return true;

    } catch (error: any) {
  await this.showLogoutPopup();

  return false;
    }
  }
  async showLogoutPopup() {

    if (this.popupShown) {
      return;
    }

    this.popupShown = true;

    let countdown = 5;

    const alert = await this.alertCtrl.create({
      cssClass: 'custom-logout-alert',
      backdropDismiss: false,

      message: `
        <div class="logout-popup">

          <img src="../../assets/session-logout.png" class="logout-img" />

          <div class="logout-title">
            You've been logged out
          </div>

          <div class="logout-message">
            Your account was logged in from another device.
            For security reasons your session has ended.
          </div>

          <div class="logout-countdown">
            Redirecting in <span id="countdown">${countdown}</span>
          </div>

        </div>
      `
    });

    await alert.present();

    const interval = setInterval(async () => {

      countdown--;

      const countdownEl = document.getElementById('countdown');

      if (countdownEl) {
        countdownEl.innerText = countdown.toString();
      }

      if (countdown === 0) {

        clearInterval(interval);

        await alert.dismiss();

        localStorage.clear();
        sessionStorage.clear();

        this.popupShown = false;

        await this.navCtrl.navigateRoot('/signin');
      }

    }, 1000);
  }
}