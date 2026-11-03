import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService } from 'src/app/services/auth/auth.service';
//import { BarcodeScanner } from '@awesome-cordova-plugins/barcode-scanner/ngx';

@Component({
    selector: 'app-products-list',
    templateUrl: './products-list.page.html',
    styleUrls: ['./products-list.page.scss'],
    standalone: false
})
export class ProductsListPage implements OnInit {

  products: any[] = [];
  page = 1;
  search = '';
  searchTerm: string = '';
  stock = '';
  expandedProductId: string | null = null; 
  loading = false;
  hasMore = true;
  loadError = '';
  private requestId = 0;
  private catalogContext = '';
  private catalogPromise: Promise<any[]> | null = null;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute // Add this
  ) {}

  ngOnInit() {
    this.loadProducts();
    
    // Listen for query params if you're passing refresh flag
    this.route.queryParams.subscribe(params => {
      if (params['refresh'] === 'true') {
        this.catalogPromise = null;
        this.loadProducts(undefined, true);
      }
    });
  }
stockFilter = 'all';

setStockFilter(value: string){
  this.stockFilter = value;
  this.onStockFilter({ detail: { value } });
}
  // This runs every time the page is about to enter
  ionViewWillEnter() {
  if (!this.loading) this.catalogPromise = null;
  this.loadProducts(undefined, true);
}

  async loadProducts(event?: any, reset = false) {
    if (!reset && (this.loading || !this.hasMore)) { event?.target?.complete(); return; }
    const requestId = ++this.requestId;
    if (reset) { this.page = 1; this.products = []; this.hasMore = true; }
    this.loading = true;
    this.loadError = '';
    try {
      let merchantId = '';
      let storeId = '';
      try {
        merchantId = JSON.parse(localStorage.getItem('merchant_data') || 'null')?.id || '';
        storeId = JSON.parse(localStorage.getItem('selected_store') || 'null')?.id || '';
      } catch {}
      const context = merchantId + ':' + storeId;
      if (!this.catalogPromise || this.catalogContext !== context) {
        this.catalogContext = context;
        this.catalogPromise = this.authService.getPchMerchantProducts(merchantId, storeId);
      }
      const catalog = this.groupProductVariations(await this.catalogPromise);
      if (requestId !== this.requestId) return;
      const search = this.search.trim().toLowerCase();
      const filtered = catalog.filter(product => {
        if (this.stock && product.stock_status !== this.stock) return false;
        return !search || [product, ...(product.childVariations || [])].some(entry => [entry.name, entry.sku, entry.id].some(value => String(value || '').toLowerCase().includes(search)));
      }).sort((a, b) => {
        const first = Date.parse(a.date_created || '') || 0;
        const second = Date.parse(b.date_created || '') || 0;
        return second - first;
      });
      const data = filtered.slice((this.page - 1) * 10, this.page * 10);
      this.products = this.page === 1 ? data : [...this.products, ...data];
      this.hasMore = this.page * 10 < filtered.length;
      this.page++;
    } catch (error: any) {
      if (requestId === this.requestId) {
        this.catalogPromise = null;
        this.loadError = error?.message || 'Unable to load products. Please try again.';
      }
    } finally {
      if (requestId === this.requestId) this.loading = false;
      event?.target?.complete();
    }
  }

  onSearchChange() {
    this.onSearch(this.searchTerm);
  }

  // Add pull-to-refresh
  async handleRefresh(event: any) {
    this.catalogPromise = null;
    await this.loadProducts(event, true);
    event.target.complete();
  }

  searchTimeout: any;

  onSearch(value: string) {

    clearTimeout(this.searchTimeout);

    this.searchTimeout = setTimeout(() => {
      this.search = value?.trim() || '';
      this.loadProducts(undefined, true);
    }, 400);
  }
  
  onStockFilter(event: any) {
    this.stock = event.detail.value === 'all'
      ? ''
      : event.detail.value;

    this.loadProducts(undefined, true);
  }

  groupProductVariations(catalog: any[]): any[] {
    const parents = catalog.filter(product => !product.parent_id || String(product.parent_id) === '0');
    return parents.map(parent => {
      if (parent.type !== 'variable') return parent;
      const children = catalog.filter(product => String(product.parent_id) === String(parent.id));
      const order = Array.isArray(parent.variations) ? parent.variations.map((item: any) => String(item?.id ?? item)) : [];
      children.sort((a, b) => {
        const first = order.indexOf(String(a.id)), second = order.indexOf(String(b.id));
        if (first >= 0 || second >= 0) return (first < 0 ? Number.MAX_SAFE_INTEGER : first) - (second < 0 ? Number.MAX_SAFE_INTEGER : second);
        return (Number(a.menu_order) || 0) - (Number(b.menu_order) || 0) || Number(a.id) - Number(b.id);
      });
      const first = children[0];
      return { ...parent, childVariations: children,
        ...(first ? { price: first.price, regular_price: first.regular_price, sale_price: first.sale_price } : {}) };
    });
  }

  onProductClick(product: any) {
    this.openProductDetails(product.id);
  }

  trackById(_: number, item: any) {
    return item.id;
  }

  getProductImage(product: any): string {
    const image = product.images?.find((item: any) => typeof item?.src === 'string' && item.src.trim());
    return image?.src.trim() || 'assets/img/Custom image.png';
  }

  onProductImageError(event: Event) {
    const image = event.target as HTMLImageElement;
    const fallback = 'assets/img/Custom image.png';
    if (image.getAttribute('src') !== fallback) image.setAttribute('src', fallback);
  }

  hasEbtTag(product: any): boolean {
  return product?.tags?.some(
    (tag: any) => tag.slug === 'ebt-eligible'
  ) || false;
}

  openProductDetails(productId: number) {
    this.router.navigate(['/products/edit', productId]);
  }
}