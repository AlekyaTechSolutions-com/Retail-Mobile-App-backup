import { Component, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth/auth.service';
import { IonDatetime } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { pencil } from 'ionicons/icons';
import { NavController } from '@ionic/angular';
 
addIcons({ pencil });
 
@Component({
    selector: 'app-add-coupon',
    templateUrl: './add-coupon.page.html',
    styleUrls: ['./add-coupon.page.scss'],
    standalone: false
})
export class AddCouponPage {
 
  @ViewChild('datePicker', { static: false }) datePicker!: IonDatetime;
  editing: string | null = null;
 
  isDateModalOpen = false;
  isDirty = false;
  isSaving = false;
  // NEW VARIABLES
  displayAmount = '0.00';
  rawDigits = '';
  displayMinAmount = '0.00';
  rawMinDigits = '';
  displayMaxAmount = '0.00';
  rawMaxDigits = '';
  couponCodeEmojiError = false;
  today: string = new Date().toISOString().split('T')[0];
  coupon: any = {
  code: '',
  description: '',
  amount: null,
  type: 'fixed_cart',
  individualUse: false,
  usageLimit: null,
  usageLimitPerUser: null,
  excludeSale: false,
  minAmount: null,
  maxAmount: null,
  expireDate: ''
};
 
  constructor(
    private navCtrl: NavController,
    private auth: AuthService,
    private router: Router
  ) {}
 
  containsEmoji(value: string): boolean {
 
  if (!value) {
    return false;
  }
 
  const emojiRegex =
    /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;
 
  return emojiRegex.test(value);
}
 
onCouponCodeChange(value: string) {
 
  if (this.containsEmoji(value)) {
 
    this.coupon.code = value.replace(
      /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu,
      ''
    );
 
    this.couponCodeEmojiError = true;
    return;
  }
 
  this.couponCodeEmojiError = false;
  this.coupon.code = value;
 
  this.markDirty();
}
 
startEdit(field: string) {
 
  this.editing = field;
 
  if (field === 'amount') {
    this.rawDigits = '';
    this.displayAmount = '0.00';
  }
 
  setTimeout(() => {
    const inputs = document.querySelectorAll('ion-input input');
    const activeInput = inputs[inputs.length - 1] as HTMLInputElement;
    activeInput?.focus();
  }, 100);
}
  showCalendar = false;
 
toggleCalendar() {
  this.showCalendar = !this.showCalendar;
}
 
onDateSelected(event: any) {
  this.coupon.expireDate = event.detail.value;
 
  // close after selecting date
  this.showCalendar = false;
}
  stopEdit() {
    this.editing = null;
  }
  onAmountInput(event: any) {
 
  const value =
    event?.detail?.value ||
    event?.target?.value ||
    '';
 
  this.rawDigits = value.replace(/[^\d]/g, '');
 
  const amount =
    Number(this.rawDigits || '0') / 100;
 
  this.displayAmount =
    amount.toFixed(2);
 
  this.coupon.amount = amount;
 
  event.target.value = this.displayAmount;
}
  onMinAmountInput(event: any) {
 
    const value =
      event?.detail?.value ||
      event?.target?.value ||
      '';
 
    this.rawMinDigits =
      value.replace(/[^\d]/g, '');
 
    const amount =
      Number(this.rawMinDigits || '0') / 100;
 
    this.displayMinAmount =
      amount.toFixed(2);
 
    this.coupon.minAmount =
      amount.toFixed(2);
 
    event.target.value =
      this.displayMinAmount;
 
    this.markDirty();
  }
 
  onMaxAmountInput(event: any) {
 
    const value =
      event?.detail?.value ||
      event?.target?.value ||
      '';
 
    this.rawMaxDigits =
      value.replace(/[^\d]/g, '');
 
    const amount =
      Number(this.rawMaxDigits || '0') / 100;
 
    this.displayMaxAmount =
      amount.toFixed(2);
 
    this.coupon.maxAmount =
      amount.toFixed(2);
 
    event.target.value =
      this.displayMaxAmount;
 
    this.markDirty();
  }
 
 
  async saveCoupon() {
 
  if (!this.coupon.code || !this.coupon.amount) {
    alert('Code and Amount required');
    return;
  }
 
  const min =
  Number(this.coupon.minAmount || 0);
 
  const max =
    Number(this.coupon.maxAmount || 0);
 
  if (min > 0 && max > 0 && min > max) {
 
    alert(
      'Minimum amount should be less than maximum amount'
    );
 
    return;
  }
 
  let merchantId = '';
  let storeId = '';
  try {
    merchantId = JSON.parse(localStorage.getItem('merchant_data') || 'null')?.id || '';
    storeId = JSON.parse(localStorage.getItem('selected_store') || 'null')?.id || '';
  } catch {}
 
  const payload: any = {
    merchantId,
    storeId,
    code: this.coupon.code,
    amount: String(this.coupon.amount),
    discountType: this.coupon.discountType || this.coupon.type || 'percent',
    description: this.coupon.description || '',
    individualUse: !!this.coupon.individualUse,
    excludeSaleItems: !!this.coupon.excludeSale,
    freeShipping: false
  };
 
  if (this.coupon.usageLimit !== null && this.coupon.usageLimit !== undefined && this.coupon.usageLimit !== '') {
    payload.usageLimit = Number(this.coupon.usageLimit);
    payload.usage_limit = Number(this.coupon.usageLimit);
  }
 
  if (this.coupon.usageLimitPerUser !== null && this.coupon.usageLimitPerUser !== undefined && this.coupon.usageLimitPerUser !== '') {
    payload.usageLimitPerUser = Number(this.coupon.usageLimitPerUser);
    payload.usage_limit_per_user = Number(this.coupon.usageLimitPerUser);
  }
 
  if (this.coupon.minAmount !== null && this.coupon.minAmount !== undefined && this.coupon.minAmount !== '') {
    payload.minimumAmount = String(this.coupon.minAmount);
    payload.minimum_amount = String(this.coupon.minAmount);
  }
 
  if (this.coupon.maxAmount !== null && this.coupon.maxAmount !== undefined && this.coupon.maxAmount !== '') {
    payload.maximumAmount = String(this.coupon.maxAmount);
    payload.maximum_amount = String(this.coupon.maxAmount);
  }
 
  if (this.coupon.expireDate) {
    payload.dateExpires = this.coupon.expireDate;
    payload.date_expires = this.coupon.expireDate;
  }
 
  if (this.isSaving) return;
  this.isSaving = true;
  try {
    const response = await this.auth.createCoupon(payload);
 
    if (response?.success === false) {
      alert(response?.message || 'Coupon creation failed');
      return;
    }
 
    alert(response.coupon?.syncStatus === 'FAILED' ? 'Coupon saved in PCH, but store sync failed. Check the coupon sync status before retrying.' : 'Coupon Created Successfully');
    this.resetForm();
    this.navCtrl.navigateBack('/tabs/coupons');
  } catch (error: any) {
    console.error(error);
    alert(error?.message || 'Unable to create coupon');
  } finally {
    this.isSaving = false;
  }
  }
  resetForm() {
    this.couponCodeEmojiError = false;
    this.coupon = {
      code: '',
      description: '',
      amount: null,
      type: 'fixed_cart',
      individualUse: false,
      usageLimit: null,
      usageLimitPerUser: null,
      excludeSale: false,
      minAmount: null,
      maxAmount: null,
      expireDate: ''
    };
 
    this.editing = null;
    this.isDirty = false;
  }
  markDirty() {
    this.isDirty = true;
  }
  ionViewWillEnter() {
    this.resetForm();
  }
}
 