import { Component, OnInit } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { AuthService } from 'src/app/services/auth/auth.service';
import axios from 'axios';
import { ApiConfigService } from 'src/app/services/api-config.service';
@Component({
    selector: 'app-discounts',
    templateUrl: './discounts.page.html',
    styleUrls: ['./discounts.page.scss'],
    standalone: false
})
export class DiscountsPage implements OnInit {
    today: string = new Date().toISOString().split('T')[0];
    filteredDiscounts: any[] = [];
    displayAmount = '0.00';
    rawDigits = '';
    activeFilter: string = 'all';
    loading = false;
    showForm = false;
    editingCoupon: any = null;
    page = 1;
    perPage = 10;
    hasMore = true;
    discounts: any[] = [];
    grouped: any = {};
    productSearch = '';
    productSuggestions: any[] = [];
    showSuggestions = false;
    private productSearchRequest = 0;
    private productCatalog: any[] | null = null;
    private productCatalogContext = '';
    selectedProductName = '';
    searchTimeout: any;
    type: string = '';
    filter_type: string = '';
    selectedProductPrice: any;
    discountSearch = '';
    discountSuggestions: any[] = [];
    selectedDiscountProducts: any[] = [];
    validationError: string = '';
    searchTerm: string = ''; //////////
    allDiscounts: any[] = []; /////////
    discountEmojiError = false;
    discountCodeEmojiError = false;
 
    form = {
      code: '',
      discount_type: 'percent',
      amount: '',
      date_starts : '',
      date_expires: '',
      pinaka_discount_auto_apply: 'no',
      usage_limit: '',
      product_id:'',
      product_label: null,
      type: '',
      qty: '',
      selectedProductPrice: '',
      selectedDiscountProductPrice: '',
      discount_product_ids: [] as number[]
    };
   
    getDiscountCount(type: string): number {
 
    if (type === 'all') {
      return this.allDiscounts.length;
    }
 
    return this.allDiscounts.filter(
      d => d.type === type
    ).length;
  }
 
   
 
    formSubmitted = false;
    constructor(
      private auth: AuthService,
      private alertCtrl: AlertController,
      private toastCtrl: ToastController,
      private apiConfig: ApiConfigService
    ) {}
    wpBases = '';
  ngOnInit() {
    try {
      this.wpBases = this.apiConfig.getBaseUrl();
    } catch {
      this.wpBases = '';
    }
    this.loadDiscounts();
  }
  formChanged = false;
 
markChanged() {
  this.formChanged = true;
}
  async loadDiscounts() {
    try {
      this.loading = true;
      const res = await this.auth.getDiscounts(String(this.page), String(this.perPage));
      const body = typeof res?.data === 'string' ? JSON.parse(res.data) : res?.data;
 
      const list = Array.isArray(body)
        ? body
        : Array.isArray(body?.discounts)
          ? body.discounts
          : Array.isArray(body?.data)
            ? body.data
            : null;
 
      if (list) {
        this.allDiscounts = list.map((d: any) => ({
          ...d,
          code: d.code || d.name || '',
          type: d.type || 'auto',
          discount_type: d.discount_type || d.discountType || 'percent',
          coupon_amount: d.coupon_amount ?? d.amount ?? 0,
          start_date: this.normalizeDiscountDate(d.start_date || d.startDate || d.date_starts || d.dateStarts || ''),
          expiry_date: this.normalizeDiscountDate(d.expiry_date || d.expiryDate || d.date_expires || d.dateExpires || d.end_date || d.endDate || ''),
          product_id: this.normalizeProductId(d.product_id ?? d.productId ?? d.product?.id ?? d.product),
          product_label: d.product_label ?? d.productLabel ?? d.product?.name ?? d.productName ?? '',
          discount_product_ids: this.normalizeProductIds(
            d.discount_product_ids ?? d.discountProductIds ?? d.discounted_product_ids ??
            d.discountedProductIds ?? d.discount_products ?? d.discountedProducts ??
            d.discount_product_id ?? d.discountProductId
          ),
          selectedProductPrice: d.selectedProductPrice ?? d.selected_product_price ?? d.product_price ?? d.productPrice ?? '',
          selectedDiscountProductPrice: d.selectedDiscountProductPrice ?? d.selected_discount_product_price ??
            d.discounted_product_price ?? d.discountedProductPrice ?? ''
        }));
      } else if (body?.data && typeof body.data === 'object') {
        this.grouped = body.data;
        this.allDiscounts = this.flattenAll();
      } else if (body && typeof body === 'object') {
        this.grouped = body;
        this.allDiscounts = this.flattenAll();
      } else {
        this.allDiscounts = [];
      }
 
      this.applySearchAndFilter();
    } catch (err) {
      this.presentToast('Failed to load discounts');
    } finally {
      this.loading = false;
    }
  }

  private normalizeProductIds(value: any): number[] {
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch { value = value.split(','); }
    }
    if (value && !Array.isArray(value)) value = [value];
    if (!Array.isArray(value)) return [];
    return value.map((item: any) => Number(typeof item === 'object' ? item.id ?? item.product_id : item))
      .filter((id: number) => Number.isFinite(id) && id > 0);
  }

  private normalizeProductId(value: any): number | string {
    const id = typeof value === 'object' && value !== null ? value.id ?? value.product_id : value;
    return id ?? '';
  }

  private normalizeDiscountDate(value: any): string {
    if (!value) return '';
    const date = String(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date;
  }
 
  onDiscountTypeChange(event: any) {
 
  const selectedType =
    event.detail.value;
 
  Object.assign(this.form, {
 
  type: selectedType,
 
  code: '',
  discount_type: '',
 
  amount: '',
  qty: '',
 
  product_id: '',
  discount_product_ids: [],
 
  usage_limit: '',
 
  date_starts: '',
  date_expires: '',
 
  pinaka_discount_auto_apply: 'no',
 
  selectedProductPrice: '',
  selectedDiscountProductPrice: ''
});
 
  // reset UI values
  this.displayAmount = '0.00';
  this.rawDigits = '';
 
  // reset searches
  this.productSearch = '';
  this.discountSearch = '';
 
  // reset selected products
  this.selectedDiscountProducts = [];
 
  // reset suggestions
  this.productSuggestions = [];
  this.discountSuggestions = [];
}
  onProductSearch(event: any) {
  let value =
    event?.detail?.value ??
    event?.target?.value ??
    '';
 
  // Block emojis
  if (this.containsEmoji(value)) {
    value = value.replace(
      /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu,
      ''
    );
 
    this.productSearch = value;
    this.emojiError = true;
    return;
  }
 
  this.emojiError = false;
 
  clearTimeout(this.searchTimeout);
  this.productSearchRequest++;
  if (value !== this.selectedProductName) {
    this.form.product_id = '';
    this.form.product_label = null;
    this.form.selectedProductPrice = '';
    this.selectedProductName = '';
  }
 
  if (!value) {
    this.showSuggestions = false;
    this.productSuggestions = [];
    this.form.product_id = '';
    this.selectedProductName = '';
    this.form.product_label = null;
    this.form.selectedProductPrice = '';
    return;
  }
 
  this.searchTimeout = setTimeout(() => {
    this.fetchProducts(value);
  }, 300);
}
 
  async fetchProducts(query: string) {
    const requestId = ++this.productSearchRequest;
    try {
      let products: any[];
      if (this.auth.isMerchantSession()) {
        let merchantId = '';
        let storeId = '';
        try {
          merchantId = JSON.parse(localStorage.getItem('merchant_data') || 'null')?.id || '';
          storeId = JSON.parse(localStorage.getItem('selected_store') || 'null')?.id || '';
        } catch {}
        const context = `${merchantId}:${storeId}`;
        if (!this.productCatalog || this.productCatalogContext !== context) {
          this.productCatalog = await this.auth.getPchMerchantProducts(merchantId, storeId);
          this.productCatalogContext = context;
        }
        const term = query.trim().toLowerCase();
        products = this.productCatalog.filter(product =>
          [product.name, product.sku, product.id].some(value => String(value || '').toLowerCase().includes(term))
        );
      } else {
        const res: any = await this.auth.searchProducts(query);
        products = Array.isArray(res) ? res : (res?.products || res?.data?.products || []);
      }
      if (requestId !== this.productSearchRequest) return;
      this.productSuggestions = products;
      this.showSuggestions = products.length > 0;
    } catch (err) {
      console.error('Product search failed', err);
      if (requestId === this.productSearchRequest) {
        this.productSuggestions = [];
        this.showSuggestions = false;
        this.presentToast((err as any)?.message || 'Unable to search products');
      }
    }
  }
 
  selectProduct(p: any) {
    this.form.product_id = p.wordpressId ?? p.id;
    this.selectedProductName = p.name || p.payload?.name || '';
    this.form.product_label = this.selectedProductName;
    this.form.selectedProductPrice = String(p.price ?? p.regular_price ?? p.payload?.price ?? '0');
    this.productSearch = this.selectedProductName;
    this.showSuggestions = false;
    this.productSuggestions = [];
    this.markChanged();
  }
  async onDiscountSearch(event: any) {
 
  let term =
    event?.detail?.value ??
    event?.target?.value ??
    '';
 
  // Block emojis
  if (this.containsEmoji(term)) {
    term = term.replace(
      /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu,
      ''
    );
 
    this.discountSearch = term;
    this.discountEmojiError = true;
    this.discountSuggestions = [];
    return;
  }
 
  this.discountEmojiError = false;
 
  clearTimeout(this.searchTimeout);
 
  this.searchTimeout = setTimeout(async () => {
    if (!term || term.length < 2) {
      this.discountSuggestions = [];
      return;
    }
 
    try {
      let products: any[];
      if (this.auth.isMerchantSession()) {
        let merchantId = '';
        let storeId = '';
        try {
          merchantId = JSON.parse(localStorage.getItem('merchant_data') || 'null')?.id || '';
          storeId = JSON.parse(localStorage.getItem('selected_store') || 'null')?.id || '';
        } catch {}
        const context = `${merchantId}:${storeId}`;
        if (!this.productCatalog || this.productCatalogContext !== context) {
          this.productCatalog = await this.auth.getPchMerchantProducts(merchantId, storeId);
          this.productCatalogContext = context;
        }
        const search = term.trim().toLowerCase();
        products = this.productCatalog.filter(product =>
          [product.name, product.sku, product.id].some(value => String(value || '').toLowerCase().includes(search))
        );
      } else {
        const res: any = await this.auth.searchProducts(term);
        products = Array.isArray(res) ? res : (res?.products || res?.data?.products || []);
      }
      this.discountSuggestions = products;
    } catch (e) {
      console.error('Discount product search failed', e);
      this.discountSuggestions = [];
    }
  }, 300);
}
 
onDiscountCodeChange(value: string) {
 
  if (this.containsEmoji(value)) {
    this.form.code = value.replace(
      /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu,
      ''
    );
 
    this.discountCodeEmojiError = true;
    return;
  }
 
  this.discountCodeEmojiError = false;
  this.form.code = value;
  this.markChanged();
}
 
 
  selectDiscountProduct(product: any) {
 
    // ❌ Prevent selecting same product as main product
  if (Number(product.id) === Number(this.form.product_id)) {
 
    this.showValidationError(
      'Main Product and Discounted Product cannot be the same'
    );
 
    return;
  }
 
  // prevent duplicates
  if (
    this.selectedDiscountProducts.find(
      p => p.id === product.id
    )
  ) return;
 
  // add selected product
  this.selectedDiscountProducts.push(product);
 
  // store IDs
  this.form.discount_product_ids =
    this.selectedDiscountProducts.map(
      p => p.id
    );
 
  // ✅ store discounted product price
    this.form.selectedDiscountProductPrice =
    String(
      product.price ||
      product.regular_price ||
      0
    );
 
  // clear search
  this.discountSearch = '';
  this.discountSuggestions = [];
}
  removeDiscountProduct(id: number) {
    this.selectedDiscountProducts =
      this.selectedDiscountProducts.filter(p => p.id !== id);
 
    this.form.discount_product_ids =
      this.selectedDiscountProducts.map(p => p.id);
  }
 
  flattenAll(): any[] {
  const all: any[] = [];
 
  Object.keys(this.grouped).forEach(key => {
    if (Array.isArray(this.grouped[key])) {
      all.push(...this.grouped[key]);
    }
  });
 
  // 🔹 Sort newest first
  return all.sort((a, b) => b.id - a.id);
}
 
 
 
    openCreate() {
      this.emojiError = false;
  this.discountEmojiError = false;
  this.discountCodeEmojiError = false;
      this.resetForm();
      this.showForm = true;
      this.productSearch = '';
      this.selectedProductName = '';
      this.discountSearch = '';
      this.discountSuggestions = [];
      this.selectedDiscountProducts = [];
      this.form.discount_product_ids = [];
     
    }
 
    async openEdit(coupon: any) {
 
      this.emojiError = false;
  this.discountEmojiError = false;
  this.discountCodeEmojiError = false;
 
  // Add these
  this.discountSearch = '';
  this.discountSuggestions = [];
  this.productSuggestions = [];
      // console.log(coupon);
     
      this.filter_type = coupon.type;
      this.editingCoupon = coupon;
      this.formChanged = false;  
     this.form = {
        code: coupon.code,
        discount_type: coupon.discount_type,
        amount: Number(coupon.coupon_amount).toFixed(2),
 
        date_starts:
          coupon.start_date?.substring(0, 10),
 
        date_expires:
          coupon.expiry_date?.substring(0, 10),
 
        pinaka_discount_auto_apply:
          coupon.pinaka_discount_auto_apply,
 
        usage_limit:
          coupon.usage_limit,
 
        product_id:
          coupon.product_id,
 
        product_label:
          coupon.product_label,
 
        selectedProductPrice:
          coupon.selectedProductPrice,
 
        selectedDiscountProductPrice: coupon.selectedDiscountProductPrice || '',
 
        type:
          coupon.type,
 
        qty:
          coupon.qty,
 
        discount_product_ids:
          coupon.discount_product_ids
      };
      this.displayAmount =
  Number(coupon.coupon_amount || 0).toFixed(2);
    this.rawDigits =
  Math.round(
    Number(coupon.coupon_amount || 0) * 100
  ).toString();
      this.showSuggestions = false;
      this.productSuggestions = [];
 
      this.productSearch = coupon.product_label || '';
      this.selectedProductName = coupon.product_label || '';
      if (coupon.discount_product_ids?.length || (this.auth.isMerchantSession() && coupon.product_id)) {
 
        try {
          if (this.auth.isMerchantSession()) {
            let merchantId = '';
            let storeId = '';
            try {
              merchantId = JSON.parse(localStorage.getItem('merchant_data') || 'null')?.id || '';
              storeId = JSON.parse(localStorage.getItem('selected_store') || 'null')?.id || '';
            } catch {}
            const context = `${merchantId}:${storeId}`;
            if (!this.productCatalog || this.productCatalogContext !== context) {
              this.productCatalog = await this.auth.getPchMerchantProducts(merchantId, storeId);
              this.productCatalogContext = context;
            }
            this.selectedDiscountProducts = this.productCatalog.filter(product =>
              coupon.discount_product_ids.includes(Number(product.id))
            );
            if (!this.selectedProductName && coupon.product_id) {
              const mainProduct = this.productCatalog.find(product => Number(product.id) === Number(coupon.product_id));
              if (mainProduct) {
                this.selectedProductName = mainProduct.name;
                this.productSearch = mainProduct.name;
                this.form.product_label = mainProduct.name;
                this.form.selectedProductPrice = String(mainProduct.price ?? mainProduct.regular_price ?? '');
              }
            }
          } else {
            const res: any = await this.auth.getProductsByIds(coupon.discount_product_ids);
            this.selectedDiscountProducts = res?.data || [];
          }
 
          console.log(
            'Discount Products:',
            this.selectedDiscountProducts
          );
 
 
          // Restore Mix n Match discounted product price
          if (
            coupon.type === 'mix_match' &&
            this.selectedDiscountProducts.length
          ) {
 
            const firstProduct =
              this.selectedDiscountProducts[0];
 
 
            // fetch full product details
            const productDetails: any = this.auth.isMerchantSession()
              ? firstProduct
              : await this.auth.getProductById(firstProduct.id);
 
 
            this.form.selectedDiscountProductPrice =
              String(
                coupon.selectedDiscountProductPrice ||
                productDetails.price ||
                productDetails.regular_price ||
                productDetails.sale_price ||
                '0.00'
              );
 
 
            console.log(
              'Discount Product Price:',
              this.form.selectedDiscountProductPrice
            );
          }
 
 
        } catch (e) {
 
          console.error(
            'Failed to load discounted products',
            e
          );
 
        }
 
      }
 
      this.showForm = true;
    }
    async restoreProduct(query: string) {
      try {
        if (this.auth.isMerchantSession() || !this.wpBases) {
          const results: any = await this.auth.searchProducts(query);
          const list = Array.isArray(results) ? results : (results?.products || []);
          if (list.length) {
            const p = list[0];
            this.selectedProductName = p.name;
            this.productSearch = p.name;
          }
          return;
        }
 
        const res = await axios.get(
        `${this.wpBases}/wp-json/wc/v3/products?search=${query}&per_page=10`,
        {
          headers: this.getAuthHeaders()
        }
      );
     
        if (res.data && res.data.length) {
          const p = res.data[0];
          console.log(p);
          this.selectedProductName = p.name;
          this.productSearch = p.name;
        }
      } catch (e) {
        console.error('Restore product failed', e);
      }
    }
    async saveCoupon() {
      this.formSubmitted = true;
 
      if (!this.isFormValid()) {
        return;
      }
      let prevfilter = this.activeFilter;
      const isEditing = !!this.editingCoupon;
      try {
        if (this.editingCoupon) {
          await this.auth.updateDiscount(this.editingCoupon.id, this.form);
        } else {
          await this.auth.createDiscount(this.form);
          prevfilter = 'all';
        }
        this.showForm = false;
        this.resetForm();
        await this.loadDiscounts();
        this.setFilter(prevfilter);
        this.presentToast(isEditing ? 'Discount updated successfully' : 'Discount created successfully');
      } catch (error: any) {
        this.presentToast(error?.message || 'Failed to save discount');
      }
    }
    isFormValid(): boolean {
      const f = this.form;
      if (!f.product_id) {
        this.showValidationError('Please select a product');
        return false;
      }
      if (f.type === 'mix_match') {
        if (!f.discount_product_ids || f.discount_product_ids.length === 0) {
          this.showValidationError(
            'Please select at least one product for Mix & Match discount'
          );
          return false;
        }
      }
 
      // Mix & Match: Main product and discounted products should not be same
      if (
        f.type === 'mix_match' &&
        f.discount_product_ids?.includes(Number(f.product_id))
      ) {
        this.showValidationError(
          'Main Product and Discounted Product cannot be the same'
        );
        return false;
      }
      if (!f.type || !f.type.trim()) {
        this.showValidationError('Please select a discount type');
        return false;
      }
      if (f.type !== 'multipack') {
        if (!f.code || !f.code.trim()) {
          this.showValidationError('Please enter a discount code');
          return false;
        }
      }
      if (f.type === 'multipack') {
        if (!f.qty || Number(f.qty) <= 0) {
          this.showValidationError('Please enter valid quantity for multipack');
          return false;
        }
      }
      console.log('Amount value:', f.amount);
      console.log('Discount type:', f.discount_type);
 
      const amount = parseFloat(
        String(f.amount || '').replace(/[^0-9.]/g, '')
      );
 
      console.log('Parsed amount:', amount);
 
      if (isNaN(amount)) {
 
        this.showValidationError(
          'Please enter a valid amount'
        );
 
        return false;
      }
 
      if (amount < 0) {
 
        this.showValidationError(
          'Discount amount cannot be negative'
        );
 
        return false;
      }
 
      if (amount === 0) {
 
        this.showValidationError(
          'Discount amount must be greater than 0'
        );
 
        return false;
      }
 
      if (
        f.discount_type === 'percent' &&
        amount > 100
      ) {
 
        this.showValidationError(
          'Percentage discount cannot exceed 100%'
        );
 
        return false;
      }
    // Fixed amount validation with product price
      if (f.discount_type !== 'percent') {
 
        let productPrice = 0;
 
 
        // Mix n Match use discounted product price
        if (f.type === 'mix_match') {
 
          productPrice =
            Number(
              f.selectedDiscountProductPrice || 0
            );
 
        } else {
 
          // Auto and Multipack use main product price
          productPrice =
            Number(
              f.selectedProductPrice || 0
            );
 
        }
 
 
        if (
          productPrice > 0 &&
          amount >= productPrice
        ) {
 
          this.showValidationError(
            'Discount amount should be less than product price'
          );
 
          return false;
        }
 
      }
          // Usage limit validation (Auto + Multipack)
    if (
      f.type === 'auto' ||
      f.type === 'multipack'
    ) {
 
      const usageLimit =
        Number(f.usage_limit);
 
 
      if (
        !Number.isInteger(usageLimit) ||
        usageLimit < 1
      ) {
 
        this.showValidationError(
          'Usage limit must be greater than or equal to 1'
        );
 
        return false;
      }
 
    }
      // normalize value
      f.amount = amount.toString();
      if(!f.date_starts)
      {
        this.showValidationError('start date is required');
        return false;
      }
      if(!f.date_expires)
      {
        this.showValidationError('end date is required');
        return false;
      }
      if (f.date_starts && f.date_expires) {
        if (new Date(f.date_expires) < new Date(f.date_starts)) {
          this.showValidationError('Expiry date cannot be before start date');
          return false;
        }
      }
      if (
        (f.type === 'multipack' || f.type === 'auto') &&
        (!f.usage_limit || Number(f.usage_limit) < 0)
      ) {
        this.showValidationError('Usage limit is required and cannot be negative');
        return false;
      }
      return true;
    }
    async showValidationError(message: string) {
      const toast = await this.toastCtrl.create({
        message,
        duration: 2500,
        color: 'danger',
        position: 'bottom'
      });
      toast.present();
    }
    async deleteCoupon(coupon: any) {
  const alert = await this.alertCtrl.create({
    header: 'Delete Discount?',
    message: `Delete discount ${coupon.code}?`,
    buttons: [
      {
        text: 'Cancel',
        role: 'cancel'
      },
      {
        text: 'Delete',
        role: 'destructive',
        handler: async () => {
          try {
            await this.auth.deleteDiscount(coupon.id, coupon.type);
            this.showForm = false;
            this.resetForm();
            await this.loadDiscounts();
            this.presentToast('Discount deleted successfully');
          } catch (error: any) {
            this.presentToast(error?.message || 'Failed to delete discount');
          }
        }
      }
    ]
  });
 
  await alert.present();
}
    resetForm() {
      this.emojiError = false;
  this.discountEmojiError = false;
  this.discountCodeEmojiError = false;
      this.formSubmitted = false;
      this.editingCoupon = null;
      this.form = {
        code: '',
        discount_type: 'percent',
        amount: '',
        date_starts: '',
        date_expires: '',
        pinaka_discount_auto_apply: 'no',
        usage_limit: '',
        product_id:'',
        product_label:null,
        type: '',
        qty: '',
        selectedProductPrice: '',
        selectedDiscountProductPrice: '',
        discount_product_ids : []
      };
    }
    async presentToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'bottom'
    });
    toast.present();
  }
  getAuthHeaders() {
    const token = localStorage.getItem('wc_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  ///////////////////////
  setFilter(type: string) {
    this.activeFilter = type;
    this.applySearchAndFilter();
  }
 
  onSearch(event: any) {
    this.searchTerm =
      event?.detail?.value ??
      event?.target?.value ??
      '';
 
    this.applySearchAndFilter();
  }
 
  applySearchAndFilter() {
 
  let filtered = [...this.allDiscounts];
 
  // 🔹 Sort by newest start_date
  filtered.sort((a, b) => {
    const dateA = new Date(a.start_date || 0).getTime();
    const dateB = new Date(b.start_date || 0).getTime();
    return dateB - dateA;
  });
 
  // 🔹 Apply Filter
  if (this.activeFilter !== 'all') {
    filtered = filtered.filter(d =>
      d.type?.toLowerCase().includes(this.activeFilter)
    );
  }
 
  // 🔹 Apply Search
  if (this.searchTerm?.trim()) {
    const term = this.searchTerm.toLowerCase().trim();
 
    filtered = filtered.filter(d =>
      d.code?.toLowerCase().includes(term) ||
      d.name?.toLowerCase().includes(term)
    );
  }
 
  this.discounts = filtered;
}
 
close() {
  this.emojiError = false;
  this.discountEmojiError = false;
  this.discountCodeEmojiError = false;
 
  this.productSearch = '';
  this.discountSearch = '';
  this.discountSuggestions = [];
  this.productSuggestions = [];
 
  this.showForm = false;
}
closeKeyboard() {
 
  const active =
    document.activeElement as HTMLElement;
 
  active?.blur();
}
 
 
onAutoApplyChange(event: any) {
  this.form.pinaka_discount_auto_apply =
    event.detail.checked ? 'yes' : 'no';
}
formatPrice(price: any): string {
  return '$' + Number(price || 0).toFixed(2);
}
onAmountInput(event: any) {
 
  let value =
    event?.detail?.value ??
    event?.target?.value ??
    '';
 
  // Prevent negative values
  if (value.includes('-')) {
 
    value = value.replace(/-/g, '');
 
    this.showValidationError(
      'Discount amount cannot be negative'
    );
  }
 
  // Keep only digits
  this.rawDigits = value.replace(/\D/g, '');
 
  const amount =
    Number(this.rawDigits || '0') / 100;
 
  this.displayAmount =
    amount.toFixed(2);
 
  this.form.amount =
    amount.toFixed(2);
 
  this.markChanged();
}
 
emojiError = false;
 
containsEmoji(value: string): boolean {
 
  if (!value) {
    return false;
  }
 
  const emojiRegex =
    /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;
 
  return emojiRegex.test(value);
}
//ends here
  ///////////////////////////////
}