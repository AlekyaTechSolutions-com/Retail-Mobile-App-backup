import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth/auth.service';
import { AlertController, NavController } from '@ionic/angular';
 
@Component({
    selector: 'app-edit-coupon',
    templateUrl: './edit-coupon.page.html',
    styleUrls: ['./edit-coupon.page.scss'],
    standalone: false
})
export class EditCouponPage implements OnInit {
 
  coupon: any = {};
  displayAmount = '0.00';
  rawDigits = '';
  displayMinAmount = '0.00';
  rawMinDigits = '';
  displayMaxAmount = '0.00';
  rawMaxDigits = '';
  couponCodeEmojiError = false;
  today = new Date().toISOString().split('T')[0];
  isDirty = false;
 
  markDirty() {
    this.isDirty = true;
  }
 
  editField: any = {
    code: false,
    description: false,
    amount: false,
    usage_limit: false,
    usage_limit_per_user: false,
    minimum_amount: false,
    maximum_amount: false,
    date_expires: false
  };
 
  constructor(
    private router: Router,
    private auth: AuthService,
    private alertCtrl: AlertController,
    private navCtrl: NavController
  ) {}
 
 
isDateModalOpen = false;
 
 
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
 
openDatePicker() {
  this.isDateModalOpen = true;
}
 
setDate(event: any) {
  this.coupon.date_expires = event.detail.value;
  this.isDateModalOpen = false;
  this.markDirty();
}
  async ngOnInit() {
 
    const stateCoupon = history.state?.coupon;
 
    const isUuid = (val: any): boolean =>
      typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
 
    const originalId = [stateCoupon?.id, stateCoupon?.couponId, stateCoupon?._id, stateCoupon?.uuid]
      .find(val => isUuid(val)) || stateCoupon?.id || stateCoupon?.couponId || stateCoupon?._id;
 
    if (!stateCoupon || !originalId) {
      this.router.navigate(['/coupons']);
      return;
    }
 
    const normalizeDate = (val: any) => {
      if (!val) return '';
      if (typeof val === 'string') {
        return val.includes('T') ? val.split('T')[0] : val.substring(0, 10);
      }
      try {
        return new Date(val).toISOString().split('T')[0];
      } catch {
        return '';
      }
    };
 
    const mapCouponFields = (data: any) => ({
      ...data,
      usage_limit: data.usage_limit ?? data.usageLimit ?? '',
      usage_limit_per_user: data.usage_limit_per_user ?? data.usageLimitPerUser ?? '',
      minimum_amount: data.minimum_amount ?? data.minimumAmount ?? data.minAmount ?? '',
      maximum_amount: data.maximum_amount ?? data.maximumAmount ?? data.maxAmount ?? '',
      individual_use: data.individual_use ?? data.individualUse ?? false,
      exclude_sale_items: data.exclude_sale_items ?? data.excludeSaleItems ?? false,
      date_expires: normalizeDate(
        data.date_expires ??
        data.dateExpires ??
        data.expireDate ??
        data.expire_date ??
        data.expiryDate ??
        data.expiry_date ??
        data.expiresAt ??
        data.expires_at ??
        data.woocommercePayload?.date_expires ??
        data.woocommercePayload?.date_expires_gmt ??
        data.woocommercePayload?.expiry_date
      )
    });
 
    this.coupon = mapCouponFields(stateCoupon);
 
    try {
      const res = await this.auth.getCouponById(originalId);
      const fetched = res?.coupon || res?.data;
      if (fetched && typeof fetched === 'object' && Object.keys(fetched).length > 0 && fetched.success !== false) {
        this.coupon = mapCouponFields({ ...this.coupon, ...fetched });
      }
    } catch (error) {
      console.warn("Failed to load coupon by id, using state coupon:", error);
    }
 
    this.coupon.id = originalId;
    this.coupon.couponId = originalId;
    if (!this.coupon.merchantId && stateCoupon.merchantId) this.coupon.merchantId = stateCoupon.merchantId;
    if (!this.coupon.storeId && stateCoupon.storeId) this.coupon.storeId = stateCoupon.storeId;
 
    this.displayAmount = Number(this.coupon.amount || 0).toFixed(2);
    this.rawDigits = Math.round(Number(this.coupon.amount || 0) * 100).toString();
 
    const min = Number(this.coupon.minimum_amount || 0);
    this.displayMinAmount = min > 0 ? min.toFixed(2) : '0.00';
    this.rawMinDigits = Math.round(min * 100).toString();
 
    const max = Number(this.coupon.maximum_amount || 0);
    this.displayMaxAmount = max > 0 ? max.toFixed(2) : '0.00';
    this.rawMaxDigits = Math.round(max * 100).toString();
 
    this.isDirty = false;
  }
  onAmountInput(event: any) {
 
  const value =
    event?.detail?.value ||
    event?.target?.value ||
    '';
 
  this.rawDigits =
    value.replace(/[^\d]/g, '');
 
  const amount =
    Number(this.rawDigits || '0') / 100;
 
  this.displayAmount =
    amount.toFixed(2);
 
  this.coupon.amount = amount;
 
  event.target.value =
    this.displayAmount;
  this.markDirty();
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
 
  this.coupon.minimum_amount =
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
 
  this.coupon.maximum_amount =
    amount.toFixed(2);
 
  event.target.value =
    this.displayMaxAmount;
  this.markDirty();
}
 
  toggleEdit(field: string) {
    const isAlreadyOpen = this.editField[field];
 
    // close all
    Object.keys(this.editField).forEach(f => {
      this.editField[f] = false;
    });
 
    // if opening
    if (!isAlreadyOpen) {
      this.editField[field] = true;
 
      setTimeout(() => {
        const inputs = document.querySelectorAll('.card input');
        const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
        lastInput?.focus();
        if (field === 'date_expires' && (lastInput as any)?.showPicker) {
          try { (lastInput as any).showPicker(); } catch {}
        }
      }, 100);
    }
  }
 
  onDateChange(event: any) {
    const val = event?.target?.value ?? event;
    if (val) {
      this.coupon.date_expires = val;
    }
    this.editField.date_expires = false;
    this.markDirty();
  }
 
 
  // Update coupon API
async updateCoupon() {
  if (!this.isDirty) return;
  try {
    const isUuid = (val: any): boolean =>
      typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
 
    const couponId = [
      this.coupon?.id,
      this.coupon?.couponId,
      this.coupon?._id,
      history.state?.coupon?.id,
      history.state?.coupon?.couponId,
      history.state?.coupon?._id
    ].find(val => isUuid(val)) || this.coupon?.id || history.state?.coupon?.id;
 
    if (!couponId) {
      window.alert('Invalid coupon ID');
      return;
    }
 
    let merchantId = this.coupon.merchantId || this.coupon.merchant_id || history.state?.coupon?.merchantId;
    let storeId = this.coupon.storeId || this.coupon.store_id || history.state?.coupon?.storeId;
    try {
      if (!merchantId) merchantId = JSON.parse(localStorage.getItem('merchant_data') || 'null')?.id || '';
      if (!storeId) storeId = JSON.parse(localStorage.getItem('selected_store') || 'null')?.id || '';
    } catch {}
 
    const payload: any = {
      ...(merchantId ? { merchantId } : {}),
      ...(storeId ? { storeId } : {}),
      code: this.coupon.code,
      amount: String(this.coupon.amount),
      discountType: this.coupon.discountType || this.coupon.discount_type || 'percent',
      description: this.coupon.description || '',
      individualUse: this.coupon.individual_use ?? this.coupon.individualUse ?? false,
      excludeSaleItems: this.coupon.exclude_sale_items ?? this.coupon.excludeSaleItems ?? false,
      freeShipping: false
    };
 
    const usageLimit = this.coupon.usage_limit ?? this.coupon.usageLimit;
    if (usageLimit !== null && usageLimit !== undefined && usageLimit !== '') {
      payload.usageLimit = Number(usageLimit);
      payload.usage_limit = Number(usageLimit);
    }
 
    const usageLimitPerUser = this.coupon.usage_limit_per_user ?? this.coupon.usageLimitPerUser;
    if (usageLimitPerUser !== null && usageLimitPerUser !== undefined && usageLimitPerUser !== '') {
      payload.usageLimitPerUser = Number(usageLimitPerUser);
      payload.usage_limit_per_user = Number(usageLimitPerUser);
    }
 
    const minAmt = this.coupon.minimum_amount ?? this.coupon.minimumAmount;
    if (minAmt !== null && minAmt !== undefined && minAmt !== '') {
      payload.minimumAmount = String(minAmt);
      payload.minimum_amount = String(minAmt);
    }
 
    const maxAmt = this.coupon.maximum_amount ?? this.coupon.maximumAmount;
    if (maxAmt !== null && maxAmt !== undefined && maxAmt !== '') {
      payload.maximumAmount = String(maxAmt);
      payload.maximum_amount = String(maxAmt);
    }
 
    const expDate = this.coupon.date_expires ?? this.coupon.dateExpires;
    if (expDate) {
      payload.dateExpires = expDate;
      payload.date_expires = expDate;
    }
 
    const response = await this.auth.updateCoupon(couponId, payload);
    if (response?.success === false) {
      window.alert(response?.message || 'Coupon update failed');
      return;
    }
 
    window.alert('Coupon updated successfully');
    this.isDirty = false;
    this.navCtrl.navigateBack('/tabs/coupons');
  } catch (error: any) {
    console.error('Update failed:', error);
    window.alert(error?.message || 'Unable to update coupon');
  }
}
 
// Delete coupon
async deleteCoupon() {
  const isUuid = (val: any): boolean =>
    typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
 
  const couponId = [
    this.coupon?.id,
    this.coupon?.couponId,
    this.coupon?._id,
    history.state?.coupon?.id,
    history.state?.coupon?.couponId,
    history.state?.coupon?._id
  ].find(val => isUuid(val)) || this.coupon?.id || history.state?.coupon?.id;
 
  if (!couponId) {
    console.error('Coupon ID missing');
    return;
  }
 
  const alert = await this.alertCtrl.create({
    header: 'Delete Coupon?',
    message: `Are you sure you want to delete ${this.coupon.code}?`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Delete',
        role: 'destructive',
        handler: async () => {
          try {
            await this.auth.deleteCoupon(couponId);
            this.navCtrl.navigateBack('/tabs/coupons');
          } catch (error: any) {
            console.error('Delete failed:', error);
            window.alert(error?.message || 'Unable to delete coupon');
          }
        }
      }
    ]
  });
 
  await alert.present();
}
 
 
 
}
 