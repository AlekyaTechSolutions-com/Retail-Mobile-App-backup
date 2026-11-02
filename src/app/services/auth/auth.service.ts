import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import axios from 'axios';
import { AssetsService } from '../assets/assets.service';
import { ApiConfigService } from '../api-config.service';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { environment } from '../../../environments/environment';
import { Filesystem } from '@capacitor/filesystem';
@Injectable({ providedIn: 'root' })
export class AuthService {

  private currentUserSubject = new BehaviorSubject<any | null>(null);
  public currentUser$: Observable<any | null> = this.currentUserSubject.asObservable();
  private base = '';
  private wpBase = '';
  constructor(
    private assetsService: AssetsService,
    private apiConfig: ApiConfigService,
  ) {
    this.loadUserFromStorage();
    this.wpBase = localStorage.getItem('wp_base_url') || '';
    this.base = localStorage.getItem('wp_base_url') || '';
  }

  private base64ToBlob(base64: string, contentType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);

  return new Blob([byteArray], { type: contentType });
}

  /** Load user when app refreshes */
  private loadUserFromStorage() {
    try {
      const user = JSON.parse(localStorage.getItem('user_data') || 'null');
      if (user && typeof user === 'object') this.currentUserSubject.next(user);
    } catch {
      localStorage.removeItem('user_data');
      localStorage.removeItem('wc_token');
    }
  }

  hasUsableSession(): boolean {
    const token = this.getToken();
    const user = this.getCurrentUser();
    if (!token || token === 'undefined' || token === 'null' || user?.token !== token) return false;
    return !this.isMerchantSession() || Date.now() < Number(localStorage.getItem('merchant_token_expires_at'));
  }

private get merchantApiUrl(): string {
    return !Capacitor.isNativePlatform() && !environment.production
      ? window.location.origin + '/pch-api'
      : environment.pchApiBaseUrl.replace(/\/+$/, '');
  }

  isMerchantSession(): boolean {
    return localStorage.getItem('auth_provider') === 'pch-merchant';
  }

  async loginMerchant(email: string, password: string) {
    const res = await CapacitorHttp.request({
      method: 'POST', url: this.merchantApiUrl + '/pos/auth/merchant-login',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      data: { email: email.trim(), password }
    });
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    const token = data?.accessToken || data?.merchantToken;
    if (res.status < 200 || res.status >= 300 || data?.success !== true || !token || !data?.merchant?.id) {
      throw new Error(data?.message || 'Merchant login failed. Please check your credentials.');
    }
    const user = { ...data.merchant, token, name: data.merchant.businessDisplayName,
      display_name: data.merchant.businessDisplayName };
    const stores = Array.isArray(data.stores) ? data.stores : [];
    localStorage.setItem('wc_token', token);
    localStorage.setItem('user_data', JSON.stringify(user));
    localStorage.setItem('auth_provider', 'pch-merchant');
    localStorage.setItem('merchant_data', JSON.stringify(data.merchant));
    localStorage.setItem('merchant_stores', JSON.stringify(stores));
    localStorage.setItem('merchant_token_expires_at', String(Date.now() + Number(data.expiresIn || 0) * 1000));
    localStorage.removeItem('selected_store');
    if (stores.length) localStorage.setItem('selected_store', JSON.stringify(stores[0]));
    this.apiConfig.clear();
    this.base = '';
    this.wpBase = '';
    this.assetsService.clearAssets();
    this.currentUserSubject.next(user);
    return data;
  }

  getMerchantId(): string {
    try {
      const merchantData = JSON.parse(localStorage.getItem('merchant_data') || 'null');
      if (merchantData?.id) return merchantData.id;
      const userData = JSON.parse(localStorage.getItem('user_data') || 'null');
      if (userData?.merchantId) return userData.merchantId;
      if (userData?.id) return userData.id;
      const token = this.getToken();
      if (token && token.includes('.')) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload?.merchantId) return payload.merchantId;
        if (payload?.sub && payload?.role === 'MERCHANT') return payload.sub;
      }
    } catch {}
    return '';
  }

  async login(email: string, password: string, siteUrl: string) {

  try {

    this.apiConfig.setBaseUrl(siteUrl);

    const baseUrl = this.apiConfig.getBaseUrl();
    const loginUrl = `${baseUrl}/wp-json/pinaka-pos/v1/token/email`;

    const res = await CapacitorHttp.request({
      method: 'POST',
      url: loginUrl,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      data: { email, password }
    });

    // console.log("LOGIN RESPONSE:", res.data);

    const data = typeof res.data === 'string'
      ? JSON.parse(res.data)
      : res.data;

    const token = data?.data?.token;

    if (!token) throw new Error("Token missing");

    localStorage.setItem('wc_token', token);
    localStorage.setItem('user_data', JSON.stringify(data.data));

    this.currentUserSubject.next(data.data);

    await this.assetsService.loadAssets();

    return data;

  } catch (err) {
    console.error("❌ LOGIN ERROR:", err);
    throw err;
  }
}



  logout() {
    ['auth_provider', 'merchant_data', 'merchant_stores', 'merchant_token_expires_at', 'selected_store'].forEach(key => localStorage.removeItem(key));
    localStorage.removeItem('wc_token');
    localStorage.removeItem('user_data');
    this.apiConfig.clear();
    this.assetsService.clearAssets();
    this.currentUserSubject.next(null);
  }

  /** Sync access (guards, interceptors) */
  getCurrentUser() {
    return this.currentUserSubject.value;
  }

  getAuthHeaders(): any {
  const token = localStorage.getItem('wc_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

  isLoggedIn(): boolean {
    return !!this.currentUserSubject.value;
  }

  getToken(): string | null {
    return localStorage.getItem('wc_token');
  }

  getSelectedStoreId(): string {
    try {
      const store = JSON.parse(localStorage.getItem('selected_store') || 'null');
      return store?.id || store?.storeId || '';
    } catch {
      return '';
    }
  }

  async updatePchMerchantEmployee(idOrCode: string | number, storeId: string, data: any): Promise<any> {
  const token = this.getToken();
  if (!this.isMerchantSession() || !token || !idOrCode || !storeId) throw new Error('Sign in with a merchant account and select a store before updating an employee.');
  const payload: any = {
    username: data.username,
    email: data.email,
    first_name: data.first_name,
    last_name: data.last_name,
    phone: data.phone
  };
  if (data.login_pin !== undefined && data.login_pin !== '') payload.login_pin = data.login_pin;
  const res = await CapacitorHttp.request({
    method: 'PUT',
    url: this.merchantApiUrl + '/merchant/employees/' + encodeURIComponent(String(idOrCode)),
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json' },
    params: { storeId },
    data: payload
  });
  const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || body?.success === false) {
    const details = body?.message || body?.error?.message || body?.errors || body?.error;
    throw new Error(typeof details === 'string' ? details : details ? JSON.stringify(details) : `Unable to update employee (HTTP ${res.status}).`);
  }
  return body;
}

async getPchStoreVendorMappings(storeId: string): Promise<any[]> {
  const token = this.getToken();
  if (!storeId || !token) throw new Error('Sign in and select a store to load vendor assignments.');
  const res = await CapacitorHttp.request({
    method: 'GET', url: this.merchantApiUrl + '/store-vendor-mappings',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    params: { store_id: storeId }
  });
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || data?.success === false) throw new Error(data?.message || 'Unable to load store vendor assignments.');
  const mappings: any[] = [];
  const findMappings = (value: any, depth = 0): any[] => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object' || depth > 5) return [];
    for (const key of ['mappings', 'storeVendorMappings', 'store_vendor_mappings', 'vendorMappings', 'vendor_mappings', 'vendors', 'items', 'results']) {
      if (Array.isArray(value[key])) return value[key];
    }
    return findMappings(value.data || value.result, depth + 1);
  };
  mappings.push(...findMappings(data));
  return mappings.filter((mapping: any) => {
    const flag = mapping.assigned ?? mapping.is_mapped ?? mapping.isMapped;
    const status = mapping.mapping_status ?? mapping.mappingStatus;
    return (flag === undefined || flag === null || flag === true || flag === 1 || /^(true|1|yes)$/i.test(String(flag))) &&
      (status === undefined || status === null || !String(status).trim() || String(status).toUpperCase() === 'ACTIVE');
  }).map((mapping: any) => {
    const nested = mapping.vendor || mapping.vendorDetails || mapping.vendor_details || mapping.vendorInfo || mapping.vendor_info;
    const vendor = nested && typeof nested === 'object' ? nested : mapping;
    const rawVendorId = mapping.vendorId || mapping.vendor_id || mapping.vendorUUID || mapping.vendor_uuid || (typeof nested === 'string' ? nested : '') || vendor.id || vendor._id || '';
    const rawMappingId = mapping.mappingId || mapping.mapping_id || mapping.mapping_uuid || mapping.mappingUUID || mapping.storeVendorMappingId || mapping.store_vendor_mapping_id || mapping.assignmentId || mapping.assignment_id || mapping.id || mapping._id || '';
    return { vendorId: String(typeof rawVendorId === 'object' ? rawVendorId.id || rawVendorId._id || '' : rawVendorId), mappingId: String(rawMappingId) };
  }).filter((item: any) => item.vendorId);
}

async mapPchVendorToStore(storeId: string, vendorId: string): Promise<any> {
  const token = this.getToken();
  if (!storeId || !vendorId || !token) throw new Error('Sign in, select a store, and choose a vendor.');
  const res = await CapacitorHttp.request({
    method: 'POST', url: this.merchantApiUrl + '/store-vendor-mappings',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json' },
    data: { store_id: storeId, vendor_id: vendorId }
  });
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || data?.success === false) throw new Error(data?.message || 'Unable to map vendor to this store.');
  return data;
}

async unmapPchVendorFromStore(storeId: string, vendorId: string, mappingId?: string): Promise<void> {
  const token = this.getToken();
  if (!storeId || !vendorId || !token) throw new Error('Sign in and select a store first.');
  const res = await CapacitorHttp.request({
    method: 'DELETE',
    url: this.merchantApiUrl + '/store-vendor-mappings' + (mappingId ? '/' + encodeURIComponent(mappingId) : ''),
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    ...(mappingId ? {} : { params: { store_id: storeId, vendor_id: vendorId } })
  });
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || data?.success === false) throw new Error(data?.message || 'Unable to unmap vendor from this store.');
}

async getPchMerchantEmployees(merchantId: string): Promise<any[]> {
  const token = this.getToken();
  if (!merchantId || !token) throw new Error('Sign in to load merchant employees.');
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: this.merchantApiUrl + '/merchants/' + encodeURIComponent(merchantId) + '/employees',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
  });
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  const employees = data?.employees || data?.data?.employees || data?.data;
  if (res.status < 200 || res.status >= 300 || data?.success === false || !Array.isArray(employees)) {
    throw new Error(data?.message || 'Unable to load merchant employees.');
  }
  return employees.map((employee: any) => ({
    ...employee,
    id: employee.employeeId || employee.employee_id || employee.id,
    first_name: employee.firstName || employee.first_name || '',
    last_name: employee.lastName || employee.last_name || '',
    roles: employee.roleId ? [employee.roleId] : (employee.roles || []),
    meta: { ...(employee.meta || {}), user_phone: employee.phone || employee.phoneNumber || '', emp_login_pin: employee.loginPin || employee.login_pin || '' }
  }));
}

async getPchMerchantRoles(merchantId: string): Promise<any[]> {
  const token = this.getToken();
  if (!merchantId || !token) throw new Error('Sign in to load employee roles.');
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: this.merchantApiUrl + '/merchants/' + encodeURIComponent(merchantId) + '/role-templates/available',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
  });
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || data?.success === false) throw new Error(data?.message || 'Unable to load employee roles.');
  const root = data?.data || data;
  const source = Array.isArray(root) ? root : (root?.roleTemplates || root?.roles || root?.items || root?.data?.roleTemplates || []);
  if (!Array.isArray(source)) return [];
  const selected = source.filter((row: any) => row?.selected === true || row?.isSelected === true);
  const pchRoles = selected.length
    ? selected
    : (Array.isArray(root?.roleTemplates) ? root.roleTemplates.filter((row: any) => row?.sourceRoleTemplateId || row?.roleTemplateId) : []);
  return pchRoles.map((row: any) => {
    const role = row.roleTemplate || row.template || row;
    // The assignment endpoint expects the merchant-scoped roleTemplateId.
    // sourceRoleTemplateId identifies the shared source template and is not assignable.
    const key = String(row.roleTemplateId || role.roleTemplateId || role.id || role._id || row.id || row.sourceRoleTemplateId || '');
    const sourceKey = String(row.sourceRoleTemplateId || role.sourceRoleTemplateId || '');
    const name = String(role.name || role.roleName || role.templateName || row.name || '').trim();
    return key && name ? { key, sourceKey, name } : null;
  }).filter(Boolean);
}

async getPchStoreEmployeeAssignments(merchantId: string, storeId: string): Promise<any[]> {
  const token = this.getToken();
  if (!merchantId || !storeId || !token) throw new Error('Sign in and select a store first.');
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: this.merchantApiUrl + '/merchants/' + encodeURIComponent(merchantId) + '/stores/' + encodeURIComponent(storeId) + '/employees',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
  });
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  const employees = data?.employees || data?.data?.employees || data?.data;
  if (res.status < 200 || res.status >= 300 || data?.success === false || !Array.isArray(employees)) {
    throw new Error(data?.message || 'Unable to load store employee assignments.');
  }
  return employees.map((employee: any) => ({
    employeeId: String(employee.employeeId || employee.employee_id || employee.id || ''),
    roleTemplateId: employee.roleTemplateId || employee.role_template_id || employee.roleId || employee.role_id || '',
    loginPin: employee.loginPin || employee.login_pin || employee.pin || ''
  })).filter((employee: any) => employee.employeeId);
}

async savePchStoreEmployeeAssignments(merchantId: string, storeId: string, employees: any[]): Promise<void> {
  const token = this.getToken();
  if (!merchantId || !storeId || !token) throw new Error('Sign in and select a store first.');
  const payload = { employees: employees.map(employee => ({
    employeeId: String(employee.employeeId), employee_id: String(employee.employeeId),
    ...(employee.roleTemplateId ? { roleTemplateId: String(employee.roleTemplateId), role_template_id: String(employee.roleTemplateId) } : {}),
    ...(employee.loginPin ? { loginPin: String(employee.loginPin), login_pin: String(employee.loginPin) } : {})
  })) };
  const res = await CapacitorHttp.request({
    method: 'PUT',
    url: this.merchantApiUrl + '/merchants/' + encodeURIComponent(merchantId) + '/stores/' + encodeURIComponent(storeId) + '/employees',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json' },
    data: payload
  });
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || data?.success === false) {
    throw new Error(data?.message || 'Unable to update employee assignments.');
  }
}

async getPchOrderStatusCounts(storeId: string): Promise<Record<string, number>> {
    if (!storeId) throw new Error('Select a store to load order counts.');
    const baseUrl = !Capacitor.isNativePlatform() && !environment.production
      ? window.location.origin + '/pch-orders-api'
      : environment.pchOrdersApiBaseUrl.replace(/\/+$/, '');
    const res = await CapacitorHttp.request({
      method: 'GET',
      url: baseUrl + '/orders/status-counts',
      headers: { Accept: 'application/json', 'x-store-id': storeId }
    });
    // Older PCH deployments route status-counts to orders/:id until upgraded.
    if (res.status === 404) {
      const entries = await Promise.all(['completed', 'pending', 'cancelled', 'refunded', 'partial_refund'].map(async key => {
        const fallback = await CapacitorHttp.request({
          method: 'GET',
          url: baseUrl + '/orders/total-orders',
          headers: { Accept: 'application/json', 'x-store-id': storeId },
          params: { status: key === 'partial_refund' ? 'partial-refund' : key, page: '1', per_page: '1' }
        });
        const body = typeof fallback.data === 'string' ? JSON.parse(fallback.data) : fallback.data;
        const count = Number(body?.order_total_count);
        if (fallback.status < 200 || fallback.status >= 300 || body?.order_total_count == null || !Number.isFinite(count) || count < 0) {
          throw new Error(body?.message || 'Unable to load order counts.');
        }
        return [key, count] as [string, number];
      }));
      const fallbackCounts: Record<string, number> = {};
      entries.forEach(([key, count]) => fallbackCounts[key] = count);
      return fallbackCounts;
    }
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    if (res.status < 200 || res.status >= 300 || data?.success !== true || !data?.status_counts || typeof data.status_counts !== 'object' || Array.isArray(data.status_counts)) {
      throw new Error(data?.message || 'Unable to load order counts.');
    }
    const counts: Record<string, number> = {};
    for (const key of ['completed', 'pending', 'cancelled', 'refunded', 'partial_refund']) {
      const count = Number(data.status_counts[key] ?? 0);
      if (!Number.isFinite(count) || count < 0) throw new Error('Invalid order count response.');
      counts[key] = count;
    }
    return counts;
  }

async getDashboardStats(
  status: string,
  fromDate: string = '',
  toDate: string = ''
): Promise<number> {

  const token = localStorage.getItem('wc_token');
  this.wpBase = this.apiConfig.getBaseUrl();

  try {
    const res = await CapacitorHttp.request({
      method: 'GET',
      url: `${this.wpBase}/wp-json/pinaka-pos/v1/orders/order-counts-for-admin-app`,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      params: {
        status,
        from_date: fromDate,
        to_date: toDate
      }
    });

    return Number(res.data?.total || 0);

  } catch (error) {
    console.error('Dashboard stats error:', error);
    return 0;
  }
}



async getPchOrdersPage(page: number, storeId: string, status = '', perPage = 10): Promise<{ orders: any[]; total: number }> {
  if (!storeId) throw new Error('Select a store on the dashboard first.');
  const baseUrl = !Capacitor.isNativePlatform() && !environment.production
    ? window.location.origin + '/pch-orders-api'
    : environment.pchOrdersApiBaseUrl.replace(/\/+$/, '');
  const params: Record<string, string> = { page: String(page), per_page: String(perPage) };
  // The summary counts processing orders in the Pending bucket.
  if (status && status !== 'all') params.status = status === 'pending' ? 'pending,processing' : status;
  const res = await CapacitorHttp.request({
    method: 'GET', url: baseUrl + '/orders/total-orders',
    headers: { ...this.getAuthHeaders(), Accept: 'application/json', 'x-store-id': storeId }, params
  });
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  const total = Number(data?.order_total_count);
  if (res.status < 200 || res.status >= 300 || !Array.isArray(data?.orders_data) || data?.order_total_count == null || !Number.isFinite(total) || total < 0) {
    throw new Error(data?.message || 'Unable to load orders.');
  }
  return { total, orders: data.orders_data.map(order => ({
    ...order,
    date_created: typeof order.date_created === 'string' ? order.date_created.replace(' ', 'T') : order.date_created,
    status: String(order.status || '').toLowerCase().replace(/[ _]+/g, '-').replace('partially-refunded', 'partial-refund')
  })) };
}

async getOrders(
  page: number,
  search: string = '',
  status: string = '',
  fromDate: string = '',
  toDate: string = ''
) {

  const token = localStorage.getItem('wc_token');
  this.wpBase = this.apiConfig.getBaseUrl();

  const params: any = {
    page: String(page),
    per_page: '10',
    orderby: 'date',
    order: 'desc',
  };

  // ✅ Status filter
  if (status) {
    params.status = status;
  }

  // ✅ Date filter
  if (fromDate) {
  params.after = `${fromDate}T00:00:00`;
}

if (toDate) {
  params.before = `${toDate}T23:59:59`;
}

  // ✅ Search filter
  if (search) {
    if (!isNaN(Number(search))) {
      params.include = search;   // search by order ID
    } else {
      params.search = search;    // search by name/email
    }
  }

  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/wc/v3/orders`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    },
    params
  });

  return typeof res.data === 'string'
    ? JSON.parse(res.data)
    : res.data;
}


async getPartialOrders(page: number, search: string = '', status: string = '')
{
  const token = localStorage.getItem('wc_token');
  this.wpBase = this.apiConfig.getBaseUrl();

  const params: any = {
    page: String(page),
    per_page: '10',
    orderby: 'date',
    order: 'desc',
  };

  // ✅ apply status filter
  if (status) {
    params.status = status;
  }

  // ⭐ detect order ID search
  if (search) {
    if (!isNaN(Number(search))) {
      params.include = search;   // search by order ID
    } else {
      params.search = search;    // search by name/email
    }
  }

  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/orders/get-mobile-partial-orders`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    },
    params
  });

  return typeof res.data === 'string'
    ? JSON.parse(res.data)
    : res.data;
}
 async getProducts(page: number, search: string = '', stock: string = '') {

  const token = localStorage.getItem('wc_token');
  this.wpBase = this.apiConfig.getBaseUrl();

  const params: any = {
    page: String(page),
    per_page: '10',
    orderby: 'date',
    order: 'desc',
  };

  // ✅ search only if typed
  if (search) {
    params.search = search;
  }

  // ✅ stock filter
  if (stock) {
    params.stock_status = stock;
  }

  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/wc/v3/products`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    },
    params
  });

  return typeof res.data === 'string'
    ? JSON.parse(res.data)
    : res.data;
}
async createProduct(product: any) {

  const token = localStorage.getItem('wc_token');
  if (product.regular_price !== undefined) {
    product.regular_price = String(product.regular_price);
  }

  if (product.sale_price !== undefined) {
    product.sale_price = String(product.sale_price);
  }
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/wc/v3/products`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    data: product
  });

  const data =
    typeof res.data === 'string'
      ? JSON.parse(res.data)
      : res.data;

  return data;
}

async updateProduct(id: number, product: any) {
  // console.log('in api service');
  // console.log(product);
  const token = localStorage.getItem('wc_token');
  product.sale_price = product.sale_price
    ? product.sale_price.toString()
    : '';

  product.regular_price = product.regular_price
    ? product.regular_price.toString()
    : '';
  const res = await CapacitorHttp.request({
    method: 'PUT',
    url: `${this.wpBase}/wp-json/wc/v3/products/${id}`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    data: product
  });

  const data =
    typeof res.data === 'string'
      ? JSON.parse(res.data)
      : res.data;

  return data;
}

async deleteProduct(id: number) {

  const token = localStorage.getItem('wc_token');

  const res = await CapacitorHttp.request({
    method: 'DELETE',
    url: `${this.wpBase}/wp-json/wc/v3/products/${id}`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    params: {
      force: 'true'
    }
  });

  const data =
    typeof res.data === 'string'
      ? JSON.parse(res.data)
      : res.data;

  return data;
}
async getProductById(id: number) {

  const token = localStorage.getItem('wc_token');

  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/wc/v3/products/${id}`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
  });

  const data =
    typeof res.data === 'string'
      ? JSON.parse(res.data)
      : res.data;

  return data;
}


private fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async uploadMedia(file: File) {
  // Convert File -> Base64
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result as string;

      // Remove "data:image/jpeg;base64,"
      resolve(result.split(',')[1]);
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const response = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/wp/v2/media`,
    headers: {
      Authorization: this.getAuthHeaders().Authorization,
      'Content-Type': file.type || 'image/jpeg',
      'Content-Disposition': `attachment; filename="${file.name || 'upload.jpg'}"`
    },
    data: base64,
    dataType: 'file'
  });

  if (response.status !== 200 && response.status !== 201) {
    console.error('Upload error:', response.data);
    throw new Error('Upload failed');
  }

  return response.data;
}

async uploadMediaFromPath(
  filePath: string,
  _fileName: string = 'upload.jpg'
) {
  console.log('Uploading path:', filePath);

  const fileData = await Filesystem.readFile({
    path: filePath
  });

  const base64 = fileData.data as string;

  const response = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/wp/v2/media`,
    headers: {
      Authorization: this.getAuthHeaders().Authorization,
      'Content-Type': 'image/jpeg',
      'Content-Disposition': 'attachment; filename="upload.jpg"'
    },
    data: base64,
    dataType: 'file'
  });

  console.log('Upload response:', response);

  if (response.status !== 200 && response.status !== 201) {
    throw new Error('Upload failed');
  }

  return response.data;
}
async updateStoreCurrency(currency: string) {
  const res = await CapacitorHttp.request({
    method: 'PUT',
    url: `${this.wpBase}/wp-json/wc/v3/settings/general/woocommerce_currency`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data: {
      value: currency
    }
  });

  return res.data;
}

async getCategories(page = 1, perPage = 100) {
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/wc/v3/products/categories`,
    headers: this.getAuthHeaders(),
    params: {
      page: String(page),
      per_page: String(perPage)
    }
  });

  return res.data;
}

async getTags() {

  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/wc/v3/products/tags`,
    headers: this.getAuthHeaders()
  });

  return res.data;
}

async createUser(newUser: any) {

  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.base}/wp-json/wp/v2/users`,
    headers: this.getAuthHeaders(),
    data: newUser
  });

  return typeof res.data === 'string'
    ? JSON.parse(res.data)
    : res.data;
}
  async getUsers(
    page: string = '1',
    perPage: string = '10',
    search: string = ''
  ) {
    const params: any = {
      page,
      per_page: perPage,
      context: 'edit'
    };

    if (search) params.search = search;

    const res = await CapacitorHttp.request({
      method: 'GET',
      url: `${this.wpBase}/wp-json/wp/v2/users`,
      headers: this.getAuthHeaders(),
      params
    });

    // ✅ always return array
    return Array.isArray(res?.data) ? res.data : [];
  }

  async getCustomers(
    page: string = '1',
    perPage: string = '10',
    search: string = ''
  ) {
    const params: any = {
      page: page,
      per_page: perPage,
      context: 'edit'
    };

    if (search) params.search = search;

    const res = await CapacitorHttp.request({
      method: 'GET',
      url: `${this.wpBase}/wp-json/wp/v2/users`,
      headers: this.getAuthHeaders(),
      params
    });

    const users = res?.data || [];

    // ✅ SAFE filtering
    return users.filter((user: any) =>
      Array.isArray(user?.roles) && user.roles.includes('customer')
    );
  }

  async createUserWithMeta(user: any) {
  try {
    console.log('Creating user with data:', user);

    if (!user?.username || !user?.email || !user?.password) {
      throw new Error('Username, email and password are required.');
    }

    const res = await CapacitorHttp.request({
      method: 'POST',
      url: `${this.wpBase}/wp-json/pinaka-pos/v1/users/create-user-with-meta`,
      headers: this.getAuthHeaders(),
      data: {
        username: user.username,
        email: user.email,
        password: user.password,
        roles: [user.role],
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        description: user.phone || '',
        meta: {
          emp_login_pin: user.emp_login_pin || '',
        },
      },
    });

    return res.data;

  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}


// async getCustomRoles() {
//   const res = await CapacitorHttp.request({
//     method: 'GET',
//     url: `${this.wpBase}/wp-json/pinaka-pos/v1/orders/custom-user-roles`,
//     headers: this.getAuthHeaders(),
//   });

//   return res.data;
// }


async updateUser(id: number, data: any) {
  console.log('Updating user with data:', data);

  const res = await CapacitorHttp.request({
    method: 'PUT',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/users/update-user-with-meta/${id}`,
    headers: this.getAuthHeaders(),
    data: data,
  });

  return res.data;
}


async deleteUser(id: number) {
  const res = await CapacitorHttp.request({
    method: 'DELETE',
    url: `${this.base}/users/${id}`,
    headers: this.getAuthHeaders(),
    params: {
      force:"1",
      reassign: "0",
    },
  });

  return res.data;
}


async getShifts(
  page: number,
  search = '',
  status = '',
  fromDate = '',
  toDate = ''
) {
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/shifts/get-all-shifts`,
    headers: this.getAuthHeaders(),
    params: {
      page: String(page),
      per_page: '10',
      search,
      status,
      from_date: fromDate,
      to_date: toDate
    },
  });

  return res.data;
}



async getOrderPayments(
  page: number,
  search = '',
  // status = '',
  paymentMode = ''
) {
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/payments/get-all-paments-for-admin`,
    headers: this.getAuthHeaders(),
    params: {
      page: String(page) ,
      per_page: "10",
      search,
      // status,
      paymentMode
    },
  });

  return res.data; // { data, pagination }
}


// List Media
async getMedia(page = "1", perPage = "20") {
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/wp/v2/media`,
    headers: this.getAuthHeaders(),
    params: {
      page: String(page) ,
      per_page: perPage,
    },
  });

  return res.data;
}


// Update Media (title / alt)
async updateMedia(id: number, data: any) {
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/wp/v2/media/${id}`,
    headers: this.getAuthHeaders(),
    data,
  });

  return res.data;
}


// Vendors
async getVendors(page = 1, perPage = "10") {
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/vendor_payments/get-all-vendors-for-admin`,
    headers: this.getAuthHeaders(),
    params: {
      page: String(page),
      per_page: perPage,
    },
  });

  return res.data;
}


// Product Attributes
async getAttributes() {
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/wc/v3/products/attributes`,
    headers: this.getAuthHeaders(),
  });

  return res.data;
}

async getTaxClasses() {
  return await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/wc/v3/taxes/classes`,
    headers: this.getAuthHeaders()
  });
}

async getTaxRates() {
  return await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/wc/v3/taxes`,
    headers: this.getAuthHeaders()
  });
}

async getAttributeTerms(attributeId: number) {
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/wc/v3/products/attributes/${attributeId}/terms`,
    headers: this.getAuthHeaders(),
  });

  return res.data;
}


// async createVariation(productId: number, data: any) {
//   console.log()
//   const res = await CapacitorHttp.request({
//     method: 'POST',
//     url: `${this.wpBase}/wp-json/wc/v3/products/${productId}/variations`,
//     headers: this.getAuthHeaders(),
//     data,
//   });

//   return res.data;
// }
async createVariation(productId: number, data: any) {
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/wc/v3/products/${productId}/variations`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data: JSON.stringify(data), // IMPORTANT for Capacitor
  });

  return res.data;
}
async updateVariation(
  productId: number,
  variationId: number,
  data: any
) {
  const res = await CapacitorHttp.request({
    method: 'PUT',
    url: `${this.wpBase}/wp-json/wc/v3/products/${productId}/variations/${variationId}`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data: JSON.stringify(data),
  });

  return res.data;
}
async getProductVariations(productId: number) {
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/wc/v3/products/${productId}/variations`,
    headers: this.getAuthHeaders(),
  });

  return res.data;
}
// WooCommerce Customer Creation
async createWooCommerceCustomer(customerData: any) {

  const url = `${this.wpBase}/wp-json/wc/v3/customers`;

  const payload = {
    email: customerData.email,
    first_name: customerData.first_name || '',
    last_name: customerData.last_name || '',
    username: customerData.username,
    password: customerData.password,
    billing: customerData.billing || {},
    shipping: customerData.shipping || {},
    meta_data: customerData.meta_data || []
  };

  try {
    const response = await CapacitorHttp.request({
      method: 'POST',
      url,
      headers: this.getAuthHeaders(),
      data: payload
    });

    return response.data;

  } catch (error) {
    console.error('Create customer error:', error);
    throw error;
  }
}


// Get Customer Roles (optional)
async getCustomerRoles() {

  const url = `${this.wpBase}/wp-json/wp/v2/users/roles`;

  try {
    const response = await CapacitorHttp.request({
      method: 'GET',
      url,
      headers: this.getAuthHeaders(),
    });

    return response.data;

  } catch (error) {
    console.error('Get roles error:', error);
    return [];
  }
}
async getCustomRoles() {
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/roles/custom-user-roles`,
    headers: this.getAuthHeaders()
  });

  let data = res.data;

  // If string → parse
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (e) {
      console.error('JSON parse error:', e);
      return [];
    }
  }

  console.log('SERVICE RETURN:', data);

  return Array.isArray(data) ? data : [];
}

async deleteMedia(id: number) {
  const res = await CapacitorHttp.request({
    method: 'DELETE',
    url: `${this.wpBase}/wp-json/wp/v2/media/${id}?force=true`,
    headers: this.getAuthHeaders()
  });

  return res.data;
}

async createEmployee(data: any) {

  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/employee/create-employee`,
    headers: {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders()
    },
    data: JSON.stringify(data)  // VERY IMPORTANT
  });

  return res.data;
}

async updateEmployee(id: number, data: any) {

  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/employee/update-employee/${id}`,
    headers: {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders()
    },
    data: JSON.stringify({
      username: data.username,
      email: data.email,
      first_name: data.first_name,
      last_name: data.last_name,
      role: data.role,
      user_phone: data.user_phone,
      emp_login_pin: data.emp_login_pin
    })
  });

  return res.data;
}

async deleteEmployee(id: number) {

  const res = await CapacitorHttp.request({
    method: 'DELETE',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/employee/delete-employee/${id}`,
    headers: this.getAuthHeaders()
  });

  return res.data;
}
// async getUserById(id: number) {
//   const res = await CapacitorHttp.request({
//     method: 'GET',
//     url: `${this.wpBase}/wp-json/wp/v2/users/${id}`,
//     headers: this.getAuthHeaders()
//   });

//   return res.data;
// }

// Fetch every page so the dashboard does not chart only the first 100 orders.
async getPchDailyOrders(storeId: string): Promise<any[]> {
  if (!storeId) throw new Error('Select a store to load daily sales.');
  const token = this.getToken();
  if (!token) throw new Error('Please sign in to load daily sales.');
  const baseUrl = !Capacitor.isNativePlatform() && !environment.production
    ? window.location.origin + '/pch-orders-api'
    : environment.pchOrdersApiBaseUrl.replace(/\/+$/, '');
  const orders: any[] = [];
  let page = 1;
  while (true) {
    const res = await CapacitorHttp.request({
      method: 'GET', url: baseUrl + '/orders/total-orders',
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token, 'x-store-id': storeId },
      params: { page: String(page), per_page: '100' }
    });
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    const total = Number(data?.order_total_count);
    if (res.status < 200 || res.status >= 300 || !Array.isArray(data?.orders_data) || data?.order_total_count == null || !Number.isFinite(total) || total < 0) {
      throw new Error(data?.message || 'Unable to load daily sales.');
    }
    orders.push(...data.orders_data);
    if (orders.length >= total) return orders;
    if (!data.orders_data.length) throw new Error('Incomplete orders response. Please try again.');
    page++;
  }
}

// Daily Sales (WooCommerce)
async getDailySales(startDate: string, endDate: string) {

  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/wc/v3/orders`,
    headers: this.getAuthHeaders(),
    params: {
      after: `${startDate}T00:00:00`,
      before: `${endDate}T23:59:59`,
      per_page: "100",
      status: 'completed'
    }
  });

  return res.data;
}

async getPchEmployeeSales(date: string, merchantId: string, storeId: string): Promise<any> {
  const token = this.getToken();
  if (!merchantId || !storeId || !token) throw new Error('Sign in and select a store on the dashboard first.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Select a valid report date.');
  const baseUrl = !Capacitor.isNativePlatform() && !environment.production
    ? window.location.origin + '/pch-api'
    : environment.pchReportsApiBaseUrl.replace(/\/+$/, '');
  const res = await CapacitorHttp.request({
    method: 'GET', url: baseUrl + '/reports-new/shift-sales',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'x-merchant-id': merchantId, 'x-store-id': storeId },
    params: { date }
  });
  const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  const data = Array.isArray(body?.shifts) ? body : body?.data;
  if (res.status < 200 || res.status >= 300 || body?.success === false || !Array.isArray(data?.shifts) || data?.total_sales == null || data?.total_orders == null) {
    throw new Error(body?.message || 'Unable to load employee sales.');
  }
  const shifts = data.shifts.map(shift => ({ shift_name: String(shift.shift_name || 'Unknown employee'), orders: Number(shift.orders), sales: Number(shift.sales) }));
  if (!Number.isFinite(Number(data.total_sales)) || !Number.isFinite(Number(data.total_orders)) || shifts.some(shift => !Number.isFinite(shift.sales) || !Number.isFinite(shift.orders))) {
    throw new Error('Invalid employee sales response.');
  }
  return { date: data.date || date, total_sales: Number(data.total_sales), total_orders: Number(data.total_orders), shifts };
}

async getPchSalesReport(type: 'daily' | 'weekly' | 'monthly', merchantId: string, storeId: string): Promise<any> {
  const token = this.getToken();
  if (!merchantId || !storeId || !token) throw new Error('Sign in and select a store on the dashboard first.');
  if (!['daily', 'weekly', 'monthly'].includes(type)) throw new Error('Invalid sales report period.');
  const baseUrl = !Capacitor.isNativePlatform() && !environment.production
    ? window.location.origin + '/pch-api'
    : environment.pchReportsApiBaseUrl.replace(/\/+$/, '');
  const res = await CapacitorHttp.request({
    method: 'GET', url: baseUrl + '/reports-new/sales',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'x-merchant-id': merchantId, 'x-store-id': storeId },
    params: { type }
  });
  const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  const data = body?.chart ? body : body?.data;
  if (res.status < 200 || res.status >= 300 || body?.success === false || !Array.isArray(data?.chart) || data?.total_sales == null || data?.total_orders == null) {
    throw new Error(body?.message || 'Unable to load sales report.');
  }
  const chart = data.chart.map(item => ({ label: String(item.label || ''), sales: Number(item.sales), orders: Number(item.orders) }));
  if (!Number.isFinite(Number(data.total_sales)) || !Number.isFinite(Number(data.total_orders)) || chart.some(item => !Number.isFinite(item.sales) || !Number.isFinite(item.orders))) {
    throw new Error('Invalid sales report response.');
  }
  return { total_sales: Number(data.total_sales), total_orders: Number(data.total_orders), chart };
}

async loadSales(type: 'daily' | 'weekly' | 'monthly') {
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/reports-new/sales`,
    headers: this.getAuthHeaders(),
    params: { type }
  });

  return res.data;
}

// Reports - Employee Sales
async loadEmployeeSales(date: string) {

  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/reports-new/shift-sales`,
    headers: this.getAuthHeaders(),
    params: { date }
  });

  return res.data;
} 
async getUserById(id: number): Promise<any> {

  const token = localStorage.getItem('token');

  const response = await fetch(
    `${this.wpBase}/wp-json/pinaka-pos/v1/employee/create-employee/${id}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }
  );

  return await response.json();
}

// Coupons
private async requestPchCoupon(method: 'GET' | 'PUT' | 'DELETE', id: string | number, data?: any): Promise<any> {
  const token = this.getToken();
  let merchantId = '', storeId = '';
  try {
    merchantId = JSON.parse(localStorage.getItem('merchant_data') || 'null')?.id || '';
    storeId = JSON.parse(localStorage.getItem('selected_store') || 'null')?.id || '';
  } catch {}
  if (!token || !merchantId || !storeId || !id) throw new Error('Sign in and select a valid coupon and store first.');
  let payload: any;
  if (method === 'PUT') {
    payload = { merchantId, storeId };
    const fields = ['code', 'amount', 'discountType', 'description', 'dateExpires', 'individualUse',
      'productIds', 'excludedProductIds', 'usageLimit', 'usageLimitPerUser', 'limitUsageToXItems',
      'freeShipping', 'productCategories', 'excludedProductCategories', 'excludeSaleItems',
      'minimumAmount', 'maximumAmount', 'emailRestrictions', 'requiredProductIds'];
    fields.forEach(key => { if (data?.[key] !== undefined) payload[key] = data[key]; });
  }
  const res = await CapacitorHttp.request({
    method, url: this.merchantApiUrl + '/coupons/' + encodeURIComponent(String(id)),
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json' },
    ...(payload ? { data: payload } : {})
  });
  let body: any;
  try { body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data; }
  catch { throw new Error('Coupon API returned an unexpected response (HTTP ' + res.status + '). Please check the API server.'); }
  if (res.status < 200 || res.status >= 300 || body?.success !== true || !body?.coupon?.id) {
    throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : (body?.message || 'Unable to load, update or delete coupon.'));
  }
  return body;
}

async createCoupon(data: any) {
  if (this.isMerchantSession()) {
    const token = this.getToken();
    let merchantId = '', storeId = '';
    try {
      merchantId = JSON.parse(localStorage.getItem('merchant_data') || 'null')?.id || '';
      storeId = JSON.parse(localStorage.getItem('selected_store') || 'null')?.id || '';
    } catch {}
    if (!token || !merchantId || !storeId) throw new Error('Sign in and select a store on the dashboard first.');
    const fields = ['code', 'amount', 'discountType', 'description', 'dateExpires', 'individualUse',
      'productIds', 'excludedProductIds', 'usageLimit', 'usageLimitPerUser', 'limitUsageToXItems',
      'freeShipping', 'productCategories', 'excludedProductCategories', 'excludeSaleItems',
      'minimumAmount', 'maximumAmount', 'emailRestrictions', 'requiredProductIds'];
    const payload: any = { merchantId, storeId };
    fields.forEach(key => { if (data[key] !== undefined) payload[key] = data[key]; });
    const res = await CapacitorHttp.request({
      method: 'POST', url: this.merchantApiUrl + '/coupons',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json' },
      data: payload
    });
    let body: any;
    try { body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data; }
    catch { throw new Error('Coupon API returned an unexpected response (HTTP ' + res.status + '). Please check the API server.'); }
    if (res.status < 200 || res.status >= 300 || body?.success !== true || !body?.coupon?.id) {
      throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : (body?.message || 'Unable to create coupon.'));
    }
    return body;
  }


  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/coupons/create`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    data: JSON.stringify(data)   // ✅ IMPORTANT
  });

  return typeof res.data === 'string'
    ? JSON.parse(res.data)
    : res.data;
}




async getCouponById(id: string | number) {
  if (this.isMerchantSession()) return this.requestPchCoupon('GET', id);

  const token = localStorage.getItem('wc_token');

  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/coupons/${id}`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });

  return typeof res.data === 'string'
    ? JSON.parse(res.data)
    : res.data;
}
async updateCoupon(id: string | number, data: any) {
  if (this.isMerchantSession()) return this.requestPchCoupon('PUT', id, data);

  const token = localStorage.getItem('wc_token');

  const res = await CapacitorHttp.request({
    method: 'PUT',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/coupons/${id}`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    data: JSON.stringify(data)  // ✅ IMPORTANT
  });

  return typeof res.data === 'string'
    ? JSON.parse(res.data)
    : res.data;
}
async deleteCoupon(id: string | number) {
  if (this.isMerchantSession()) return this.requestPchCoupon('DELETE', id);

  const token = localStorage.getItem('wc_token');

  const res = await CapacitorHttp.request({
    method: 'DELETE',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/coupons/${id}`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });

  return typeof res.data === 'string'
    ? JSON.parse(res.data)
    : res.data;
}
async updatePchSettingToggle(merchantId: string, storeId: string, key: string, enabled: boolean): Promise<{ enabled: boolean; message: string }> {
  const endpoints: Record<string, { route: string; requestKey: string; responseKey: string }> = {
    enable_safes_drop: { route: 'enable-safes-drop', requestKey: 'enable_safes_drop', responseKey: 'enable_safes_drop' },
    enableTaxes: { route: 'enable-taxes', requestKey: 'enable_taxes', responseKey: 'enable_taxes' },
    enableCoupons: { route: 'enable-coupons', requestKey: 'enable_coupons', responseKey: 'enable_coupons' },
    sequentialCoupons: { route: 'sequential-coupons', requestKey: 'coupon_sequential', responseKey: 'sequential_coupons' },
    enable_cashback: { route: 'enable-cashback', requestKey: 'enable_cashback', responseKey: 'enable_cashback' },
    enable_service_charge: { route: 'enable-service-charge', requestKey: 'enable_service_charge', responseKey: 'enable_service_charge' },
    enable_loyalty_points: { route: 'enable-loyalty-points', requestKey: 'enable_loyalty_points', responseKey: 'enable_loyalty_points' }
  };
  const endpoint = endpoints[key];
  const token = this.getToken();
  if (!endpoint || !merchantId || !storeId || !token) throw new Error('Sign in and select a store before updating settings.');
  const res = await CapacitorHttp.request({
    method: 'POST', url: this.merchantApiUrl + '/settings/' + endpoint.route,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json', 'x-merchant-id': merchantId, 'x-store-id': storeId },
    data: { [endpoint.requestKey]: key === 'enable_loyalty_points' ? (enabled ? 'yes' : 'no') : (['enable_safes_drop', 'enableTaxes', 'enable_cashback'].includes(key) ? enabled : (enabled ? 1 : 0)) }
  });
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  const value = data?.data?.[endpoint.responseKey];
  const validValues = key === 'enable_loyalty_points' ? ['yes', 'no', true, false, 1, 0, '1', '0', 'true', 'false'] : [true, false, 1, 0, '1', '0', 'true', 'false'];
  if (res.status < 200 || res.status >= 300 || data?.success !== true || !validValues.includes(value)) {
    throw new Error(data?.message || 'Failed to update setting.');
  }
  return { enabled: value === true || value === 1 || value === '1' || value === 'true' || value === 'yes', message: data.message || (enabled ? 'Enabled' : 'Disabled') };
}

async updatePchSafes(merchantId: string, storeId: string, enabled: boolean): Promise<{ enabled: boolean; message: string }> {
  const token = this.getToken();
  if (!merchantId || !storeId || !token) throw new Error('Sign in and select a store first.');
  const res = await CapacitorHttp.request({
    method: 'POST', url: this.merchantApiUrl + '/settings/enable-safes',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json', 'x-merchant-id': merchantId, 'x-store-id': storeId },
    data: { enable_safes: enabled }
  });
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  const value = data?.data?.enable_safes;
  if (res.status < 200 || res.status >= 300 || data?.success !== true || ![true, false, 1, 0, '1', '0', 'true', 'false'].includes(value)) {
    throw new Error(data?.message || 'Failed to update safes.');
  }
  return { enabled: value === true || value === 1 || value === '1' || value === 'true', message: data.message || (enabled ? 'Safes enabled' : 'Safes disabled') };
}

async getPchConfigurationFlags(merchantId: string, storeId: string): Promise<any> {
  const token = this.getToken();
  if (!merchantId || !storeId || !token) throw new Error('Sign in and select a store on the dashboard first.');
  const res = await CapacitorHttp.request({
    method: 'GET', url: this.merchantApiUrl + '/settings/configuration-flags',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'x-merchant-id': merchantId, 'x-store-id': storeId }
  });
  const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || body?.success !== true || !body?.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
    throw new Error(body?.message || 'Unable to load configuration flags.');
  }
  return body.data;
}

async getPchCashSettings(merchantId: string, storeId: string): Promise<any> {
  const token = this.getToken();
  if (!merchantId || !storeId || !token) throw new Error('Sign in and select a store on the dashboard first.');
  const res = await CapacitorHttp.request({
    method: 'GET', url: this.merchantApiUrl + '/settings/cash-settings',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'x-merchant-id': merchantId, 'x-store-id': storeId }
  });
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || data?.success !== true || !data?.data || typeof data.data !== 'object' || Array.isArray(data.data)) {
    throw new Error(data?.message || 'Unable to load shop settings.');
  }
  return data.data;
}

async getPchStoreTaxonomies(storeId: string): Promise<{ categories: any[]; tags: any[] }> {
  const token = this.getToken();
  if (!storeId || !token) throw new Error('Sign in and select a store on the dashboard first.');
  const res = await CapacitorHttp.request({
    method: 'GET', url: this.merchantApiUrl + '/stores/' + encodeURIComponent(storeId) + '/catalog/taxonomies',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
  });
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || data?.success !== true || !Array.isArray(data?.categories) || !Array.isArray(data?.tags)) {
    throw new Error(data?.message || 'Unable to load product categories and tags.');
  }
  return { categories: data.categories, tags: data.tags };
}

async getPchStoreDetails(storeId: string): Promise<any> {
  if (!storeId) throw new Error('Select a store on the dashboard first.');
  const res = await CapacitorHttp.request({
    method: 'GET', url: this.merchantApiUrl + '/stores/' + encodeURIComponent(storeId),
    headers: { ...this.getAuthHeaders(), Accept: 'application/json' }
  });
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || data?.success !== true || !data?.store?.id) {
    throw new Error(data?.message || 'Unable to load shop address.');
  }
  return this.mapPchShopDetails(data.store);
}

private mapPchShopDetails(store: any): any {
  return {
    id: store.id, storeName: store.storeName, storeEmail: store.storeEmail, phone: store.phone,
    addressLine1: store.addressLine1, addressLine2: store.addressLine2,
    city: store.city, state: store.state, postalCode: store.postalCode, country: store.country,
    currency: store.currency, timezone: store.timezone
  };
}

async updatePchStoreAddress(storeId: string, payload: {
  name: string; store_email: string; phone: string; address_line1: string; address_line2: string;
  city: string; state: string; postal_code: string; country: string; currency?: string; timezone?: string;
}): Promise<{ store: any; message: string }> {
  if (!storeId) throw new Error('Select a store on the dashboard first.');
  const res = await CapacitorHttp.request({
    method: 'PUT', url: this.merchantApiUrl + '/stores/' + encodeURIComponent(storeId),
    headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json', Accept: 'application/json' },
    data: payload
  });
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || data?.success !== true || !data?.store?.id) {
    throw new Error(data?.message || 'Failed to update shop address.');
  }
  return { store: this.mapPchShopDetails(data.store), message: data.message || 'Shop address updated successfully' };
}

async getPchVendors(merchantId: string): Promise<any[]> {
  const token = this.getToken();
  if (!merchantId || !token) throw new Error('Please sign in to load vendors.');
  const res = await CapacitorHttp.request({
    method: 'GET', url: this.merchantApiUrl + '/merchants/' + encodeURIComponent(merchantId) + '/vendors',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
  });
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || data?.success !== true || !Array.isArray(data?.vendors)) {
    throw new Error(data?.message || 'Unable to load vendors.');
  }
  return data.vendors.map(vendor => ({ ...vendor, title: vendor.vendor_name }));
}

async getPchEmployees(merchantId: string, storeId: string): Promise<any[]> {
  const token = this.getToken();
  if (!merchantId || !storeId || !token) throw new Error('Sign in and select a store on the dashboard first.');
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: this.merchantApiUrl + '/merchants/' + encodeURIComponent(merchantId) + '/stores/' + encodeURIComponent(storeId) + '/employees',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
  });
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || data?.success !== true || !Array.isArray(data?.employees)) {
    throw new Error(data?.message || 'Unable to load employees.');
  }
  return data.employees.map(employee => ({
    ...employee,
    id: employee.employeeId,
    first_name: employee.firstName || '',
    last_name: employee.lastName || '',
    roles: employee.roleId ? [employee.roleId] : [],
    meta: { user_phone: employee.phone || '', emp_login_pin: employee.loginPin || '' }
  }));
}

async getShiftDetailsByDate(date: string, storeId: string): Promise<any[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Select a valid shift date.');
  const token = this.getToken();
  if (!token || !storeId) throw new Error('Sign in and select a store on the dashboard first.');
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: this.merchantApiUrl + '/pos/shifts/shifts-by-date',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    params: { date, store_id: storeId }
  });
  const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || body?.success !== true || !Array.isArray(body?.data)) {
    throw new Error(body?.message || 'Unable to load shift details.');
  }
  return body.data.map((row: any) => ({ ...row,
    start_time: row.start_time ? String(row.start_time).replace(' ', 'T') : '',
    end_time: row.end_time ? String(row.end_time).replace(' ', 'T') : ''
  }));
}

async getPchDailyShiftSummary(storeId: string): Promise<any[]> {
  const token = this.getToken();
  if (!storeId || !token) throw new Error('Sign in and select a store on the dashboard first.');
  const res = await CapacitorHttp.request({
    method: 'GET', url: this.merchantApiUrl + '/pos/shifts/get-daily-shift-summary',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    params: { store_id: storeId }
  });
  const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || body?.success !== true || !Array.isArray(body?.data)) {
    throw new Error(body?.message || 'Unable to load shifts.');
  }
  return body.data;
}

async getPchPaymentRecords(storeId: string): Promise<any[]> {
  const token = this.getToken();
  if (!storeId || !token) throw new Error('Sign in and select a store on the dashboard first.');
  const res = await CapacitorHttp.request({
    method: 'GET', url: this.merchantApiUrl + '/stores/' + encodeURIComponent(storeId) + '/pos/payment-records',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
  });
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || data?.success !== true || !Array.isArray(data?.payments)) {
    throw new Error(data?.message || 'Unable to load payments.');
  }
  return data.payments;
}

async getPchMerchantProducts(merchantId: string, storeId: string): Promise<any[]> {
  const token = this.getToken();
  if (!token || !merchantId || !storeId) throw new Error('Sign in and select a store on the dashboard first.');
  const res = await CapacitorHttp.request({
    method: 'GET', url: this.merchantApiUrl + '/pos/auth/merchant/catalog/products',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'x-merchant-id': merchantId, 'x-store-id': storeId }
  });
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || data?.success !== true || !Array.isArray(data?.products)) {
    throw new Error(data?.message || 'Unable to load products.');
  }
  return data.products.map(product => {
    const payload = product.payload || {};
    return {
      ...payload, ...product,
      id: product.wordpressId ?? payload.id ?? product.id,
      price: product.price ?? payload.price ?? '0',
      images: payload.images?.length ? payload.images : product.image ? [{ src: product.image }] : [],
      tags: product.tags?.length ? product.tags : payload.tags || [],
      stock_status: product.stock_status ?? payload.stock_status ?? '',
      regular_price: product.regular_price ?? payload.regular_price ?? product.price ?? '0',
      sale_price: product.sale_price ?? payload.sale_price ?? '',
      type: product.type ?? payload.type ?? 'simple',
      status: product.status ?? payload.status ?? '',
      date_created: product.date_created ?? payload.date_created ?? '',
      sku: product.sku ?? payload.sku ?? ''
    };
  });
}

async getPchCoupons(merchantId: string, storeId: string): Promise<any[]> {
  if (!merchantId || !storeId) throw new Error('Sign in and select a store on the dashboard first.');
  const token = this.getToken();
  if (!token) throw new Error('Please sign in to load coupons.');
  const baseUrl = this.merchantApiUrl;
  const coupons: any[] = [];
  let page = 1;
  while (true) {
    const res = await CapacitorHttp.request({
      method: 'GET', url: baseUrl + '/coupons',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      params: { merchantId, storeId, page: String(page), per_page: '20' }
    });
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    const total = Number(data?.total);
    if (res.status < 200 || res.status >= 300 || data?.success !== true || !Array.isArray(data?.coupons) || data?.total == null || !Number.isFinite(total) || total < 0) {
      throw new Error(data?.message || 'Unable to load coupons.');
    }
    coupons.push(...data.coupons.map(coupon => ({
      ...coupon.woocommercePayload,
      ...coupon,
      discount_type: coupon.discountType ?? coupon.woocommercePayload?.discount_type,
      date_expires: coupon.dateExpires ?? coupon.woocommercePayload?.date_expires,
      usage_count: coupon.usageCount ?? coupon.woocommercePayload?.usage_count ?? 0,
      usage_limit: coupon.usageLimit ?? coupon.woocommercePayload?.usage_limit ?? 0,
      individual_use: coupon.individualUse ?? coupon.woocommercePayload?.individual_use ?? false,
      product_ids: coupon.productIds ?? [],
      excluded_product_ids: coupon.excludedProductIds ?? [],
      minimum_amount: coupon.minimumAmount,
      maximum_amount: coupon.maximumAmount
    })));
    if (coupons.length >= total) return coupons;
    if (!data.coupons.length) throw new Error('Incomplete coupon response. Please try again.');
    page++;
  }
}

async getCoupons(page = 1) {

  const token = localStorage.getItem('wc_token');
  this.wpBase = this.apiConfig.getBaseUrl();

  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/coupons`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    },
    params: {
      page: String(page),
      per_page: "20"
    }
  });

  return typeof res.data === 'string'
    ? JSON.parse(res.data)
    : res.data;
}

// Cash Settings
async getCashSettings() {
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/settings/cash-settings`,
    headers: this.getAuthHeaders()
  });

  return res.data;
}

async saveCashSettings(payload: any) {
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/settings/cash-settings`,
    headers: this.getAuthHeaders(),
    data: payload
  });

  return res.data;
}

async saveDenominations(type: string, payload: any) {
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/settings/denominations/${type}`,
    headers: this.getAuthHeaders(),
    data: payload
  });

  return res.data;
}


// Forgot Password
async forgotPassword(email: string) {
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka/v1/forgot-password`,
    data: { email }
  });

  return res.data;
}


// Discounts
async getDiscounts(page = "1", perPage = "10", storeId?: string) {
  const token = this.getToken();
  const currentStoreId = storeId || this.getSelectedStoreId();
 
  if (this.isMerchantSession() || currentStoreId) {
    if (!currentStoreId || !token) {
      return { data: { success: true, discounts: [] } };
    }
    const res = await CapacitorHttp.request({
      method: 'GET',
      url: `${this.merchantApiUrl}/stores/${encodeURIComponent(currentStoreId)}/merchant/discounts`,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
      params: { page: String(page), per_page: String(perPage) }
    });
    return res;
  }
 
  if (!this.wpBase || !token) {
    return { data: { data: {} } };
  }
 
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/custom-discount/get-all-discounts-for-admin`,
    headers: this.getAuthHeaders(),
    params: { page, per_page: perPage }
  });
 
  return res;
}

async createDiscount(data: any) {
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/custom-discount/create-discount`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data
  });

  return res.data;
}

async updateDiscount(id: number, data: any) {
  data.discount_id = id;

  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/custom-discount/update-discount/`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data
  });

  return res.data;
}

async getProductsByIds(ids: number[], data: any = {}) {
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/custom-discount/by-ids`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data: { ...data, ids }
  });

  return res.data;
}


// Product Search
async searchProducts(term: string) {
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/wc/v3/products`,
    headers: this.getAuthHeaders(),
    params: { search: term }
  });

  return res.data;
}


// Delete Discount
async deleteDiscount(id: number, type: string, data: any = {}) {
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/custom-discount/delete-discount`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data: { ...data, id, type }
  });

  return res.data;
}


async saveBussinessInfo(payload: any) {
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/settings/business-info`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'   // ✅ MUST
    },
    data: payload          // 🔥 IMPORTANT FIX
  });

  return res.data;
}

async enableTaxes(payload: any) {
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/settings/enable-taxes`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data: payload
  });

  return res.data;
}

async enableCoupons(payload: any) {
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/settings/enable-coupons`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data: payload
  });

  return res.data;
}

async sequentialCoupons(payload: any) {
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/settings/sequential-coupons`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data: payload
  });

  return res.data;
}

async createTag(payload: any) {
  if (this.isMerchantSession()) return this.changePchCatalogTerm('POST', payload, undefined, 'tags');

  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/wc/v3/products/tags`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data: payload
  });

  const data = res.data;

  return data;
}

async deleteTag(id: number) {
  if (this.isMerchantSession()) return this.changePchCatalogTerm('DELETE', undefined, id, 'tags');

  const res = await CapacitorHttp.request({
    method: 'DELETE',
    url: `${this.wpBase}/wp-json/wc/v3/products/tags/${id}`,
    headers: this.getAuthHeaders(),
    params: {
      force: "1"
    }
  });

  return typeof res.data === 'string'
    ? JSON.parse(res.data)
    : res.data;
}

async updateTag(tagId: number, payload: any) {
  if (this.isMerchantSession()) return this.changePchCatalogTerm('PUT', payload, tagId, 'tags');

  const res = await CapacitorHttp.request({
    method: 'PUT',
    url: `${this.wpBase}/wp-json/wc/v3/products/tags/${tagId}`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data: payload
  });

  return res.data;
}

// Categories
private async changePchCatalogTerm(method: 'POST' | 'PUT' | 'DELETE', payload?: any, termId?: number, taxonomy: 'categories' | 'tags' = 'categories'): Promise<any> {
  let storeId = '';
  try { storeId = JSON.parse(localStorage.getItem('selected_store') || 'null')?.id || ''; } catch {}
  const token = this.getToken();
  if (!storeId || !token) throw new Error('Sign in and select a store first.');
  if (method !== 'POST' && (!Number.isInteger(termId) || Number(termId) <= 0)) throw new Error('Invalid catalog term ID.');
  const res = await CapacitorHttp.request({
    method,
    url: this.merchantApiUrl + '/stores/' + encodeURIComponent(storeId) + '/catalog/' + taxonomy + (method === 'POST' ? '' : '/' + termId),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(method === 'DELETE' ? {} : { data: payload })
  });
  const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || body?.success !== true || (method !== 'DELETE' && (body?.data?.id == null || typeof body?.data?.name !== 'string'))) {
    throw new Error(body?.message || 'Catalog operation failed.');
  }
  return { ...(body.data || {}), pchSyncWarning: body.synced === false ? body.message || 'Saved; catalog sync is pending.' : '' };
}

async saveCategory(payload: any) {
  if (this.isMerchantSession()) return this.changePchCatalogTerm('POST', payload);

  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/wc/v3/products/categories`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data: payload
  });

  const data = res.data;

  return data;
}

async updateCategory(categoryId: number, payload: any) {
  if (this.isMerchantSession()) return this.changePchCatalogTerm('PUT', payload, categoryId);

  const res = await CapacitorHttp.request({
    method: 'PUT',
    url: `${this.wpBase}/wp-json/wc/v3/products/categories/${categoryId}`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data: payload
  });

  return res.data;
}

async deleteCategory(id: number) {
  if (this.isMerchantSession()) return this.changePchCatalogTerm('DELETE', undefined, id);
  const res = await CapacitorHttp.request({
    method: 'DELETE',
    url: `${this.wpBase}/wp-json/wc/v3/products/categories/${id}`,
    headers: this.getAuthHeaders(),
    params: { force: "1" }
  });

  return res.data;
}


// async updateEnableSafes(payload: any) {
//   const res = await CapacitorHttp.request({
//     method: 'POST',
//     url: `${this.wpBase}/wp-json/pinaka-pos/v1/settings/enable-safes`,
//     headers: this.getAuthHeaders(),
//     data: payload
//   });

//   return res.data;
// }
async updateEnableSafes(payload: any) {
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/settings/enable-safes`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data: payload
  });

  return res.data;
}

// async updateEnableSafesDrop(payload: any) {
//   const res = await CapacitorHttp.request({
//     method: 'POST',
//     url: `${this.wpBase}/wp-json/pinaka-pos/v1/settings/enable-safes-drop`,
//     headers: this.getAuthHeaders(),
//     data: payload
//   });

//   return res.data;
// }
async updateEnableSafesDrop(payload: any) {
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/settings/enable-safes-drop`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data: payload
  });

  return res.data;
}

async updateCashback(payload: any) {
  return CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/settings/enable-cashback`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data: payload
  });
}


async updateServiceCharge(payload: any) {
  return CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/settings/enable-service-charge`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data: payload
  });
}


async updateLoyaltyPoints(payload: any) {
  return CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/settings/enable-loyalty-points`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data: payload
  });
}


// Vendors
async createVendor(data: any) {
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/vendor_payments/create-vendor`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    data: JSON.stringify(data)   // ✅ IMPORTANT for Capacitor HTTP
  });

  console.log('Create Vendor Response:', res.data);

  return res.data;
}

async updateVendor(id: number, data: any) {
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/vendor_payments/update-vendor/${id}`,
    headers: {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'   // ✅ important
    },
    data: JSON.stringify(data)             // ✅ important for Capacitor
  });

  console.log('Update Vendor Response:', res.data);

  return res.data;
}


async deleteVendor(id: number) {
  const res = await CapacitorHttp.request({
    method: 'DELETE',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/vendor_payments/delete-vendor/${id}`,
    headers: this.getAuthHeaders()
  });

  return res.data;
}

async loadShiftSales( date: string ){
  
}

// async updateProfile(formData: FormData) {

//   const token = localStorage.getItem('wc_token');

//   const res = await fetch(`${this.wpBase}/wp-json/pinaka-pos/v1/profile`, {
//     method: 'POST',
//     headers: {
//       Authorization: `Bearer ${token}`
//       // ⚠️ DO NOT add Content-Type
//     },
//     body: formData
//   });

//   const data = await res.json();

//   return data;
// }

async getProfile(): Promise<any> {
  const token = this.getToken();
  const merchantId = this.getMerchantId();
 
  if (merchantId || this.isMerchantSession()) {
    const id = merchantId || 'ce7e95a3-5dd3-4063-af03-251825c9a2d9';
    const res = await CapacitorHttp.request({
      method: 'GET',
      url: `${this.merchantApiUrl}/merchants/${encodeURIComponent(id)}`,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });
 
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    if (data?.merchant) {
      const m = data.merchant;
      return {
        ...m,
        first_name: m.first_name || m.firstName || '',
        last_name: m.last_name || m.lastName || '',
        lastname: m.last_name || m.lastName || '',
        email: m.email || m.merchantEmail || '',
        phone: m.phone || m.merchantPhoneNumber || '',
        address_line1: m.address_line1 || m.addressLine1 || '',
        address_line2: m.address_line2 || m.addressLine2 || '',
        postal_code: m.postal_code || m.postalCode || m.pinCode || '',
        state: m.state || '',
        city: m.city || '',
        country: m.country || ''
      };
    }
    return data;
  }
 
  const baseUrl = this.apiConfig.getBaseUrl();
  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${baseUrl}/wp-json/pinaka-pos/v1/profile`,
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
 
  return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
}
 
async updateProfile(data: any): Promise<any> {
  const token = this.getToken();
  const merchantId = this.getMerchantId();
 
  if (merchantId || this.isMerchantSession()) {
    const id = merchantId || 'ce7e95a3-5dd3-4063-af03-251825c9a2d9';
    const payload: any = {
      first_name: data.first_name,
      last_name: data.last_name,
      merchantEmail: data.email,
      merchantPhoneNumber: data.phone,
      address_line1: data.address_line1,
      address_line2: data.address_line2 || '',
      postal_code: data.postal_code,
      state: data.state,
      city: data.city,
      country: data.country
    };
 
    const res = await CapacitorHttp.request({
      method: 'PATCH',
      url: `${this.merchantApiUrl}/merchants/${encodeURIComponent(id)}`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      data: payload
    });
 
    const resData = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    if (res.status >= 200 && res.status < 300 && resData?.success !== false) {
      if (resData?.merchant) {
        const currentMerchant = JSON.parse(localStorage.getItem('merchant_data') || '{}');
        const updatedMerchant = { ...currentMerchant, ...resData.merchant };
        localStorage.setItem('merchant_data', JSON.stringify(updatedMerchant));
 
        const currentUser = JSON.parse(localStorage.getItem('user_data') || '{}');
        const updatedUser = {
          ...currentUser,
          ...resData.merchant,
          first_name: resData.merchant.first_name || resData.merchant.firstName,
          last_name: resData.merchant.last_name || resData.merchant.lastName,
          email: resData.merchant.email || resData.merchant.merchantEmail,
          phone: resData.merchant.phone || resData.merchant.merchantPhoneNumber
        };
        localStorage.setItem('user_data', JSON.stringify(updatedUser));
        this.currentUserSubject.next(updatedUser);
      }
      return { success: true, message: 'Profile updated successfully', ...resData };
    }
    throw new Error(resData?.message || 'Failed to update profile');
  }
 
  const baseUrl = this.apiConfig.getBaseUrl();
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${baseUrl}/wp-json/pinaka-pos/v1/profile`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    data
  });
 
  return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
}

async uploadProfileImage(file: File) {
  const token = this.getToken();
  const baseUrl = this.apiConfig.getBaseUrl();

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${baseUrl}/wp-json/pinaka-pos/v1/profile/upload-image`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    data: {
      image: base64,
      filename: file.name
    }
  });

  console.log(res);

  return typeof res.data === 'string'
    ? JSON.parse(res.data)
    : res.data;
}

async getProfileImage() {
  const token = this.getToken();
  const baseUrl = this.apiConfig.getBaseUrl();

  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${baseUrl}/wp-json/pinaka-pos/v1/profile/get-image`,
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  return typeof res.data === 'string'
    ? JSON.parse(res.data)
    : res.data;
}

async deleteProfileImage() {
  const token = this.getToken();
  const baseUrl = this.apiConfig.getBaseUrl();

  const res = await CapacitorHttp.request({
    method: 'DELETE',
    url: `${baseUrl}/wp-json/pinaka-pos/v1/profile/delete-image`,
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  return typeof res.data === 'string'
    ? JSON.parse(res.data)
    : res.data;
}

async validateToken(token: string): Promise<{ valid: boolean }> {

  this.wpBase = this.apiConfig.getBaseUrl();

  try {
    const res = await CapacitorHttp.request({
      method: 'GET',
      url: `${this.wpBase}/wp-json/pinaka-pos/v1/profile`, // ✅ existing safe endpoint
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });

    // If API success → token valid
    if (res?.status === 200) {
      return { valid: true };
    }

    return { valid: false };

  } catch (error) {
    console.error('Token validation failed:', error);
    return { valid: false };
  }
}

async logout_by_id(emp_login_pin: number) {

    const emp_login_pinn = emp_login_pin || 0;

    let url = localStorage.getItem('wp_base_url');

    if (!url) {
      url = this.apiConfig.getBaseUrl();
    }

    const res = await CapacitorHttp.request({
      method: 'POST',
      url: `${url}/wp-json/pinaka-pos/v1/token/logout-by-id`,
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        emp_login_pin: emp_login_pinn
      }
    });

    return res.data;
  }
  async validateuser(token: string): Promise<{ valid: boolean }> {
    if (this.isMerchantSession()) {
      // PCH endpoints enforce authentication; never validate a PCH token through WordPress.
      return { valid: token === this.getToken() && Date.now() < Number(localStorage.getItem('merchant_token_expires_at')) };
    }


    this.wpBase = this.apiConfig.getBaseUrl();

    try {
      const res = await CapacitorHttp.request({
        method: 'GET',
        url: `${this.wpBase}/wp-json/pinaka-pos/v1/profile`,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      });
      if (res?.status === 403 || res?.status === 401) {
        return { valid: false };
      }
      else{
        return { valid: true };
      }
    } catch (error) {
      console.error('Token validation failed:', error);
      return { valid: false };
    }
  }

  async getLoyaltyCustomers() {

    const res = await CapacitorHttp.request({
      method: 'GET',
      url: `${this.wpBase}/wp-json/pinaka-pos/v1/loyalty/get-all-customers`,
      headers: this.getAuthHeaders()
    });

    return res.data;
  }
  
 async getPosClosing(startDate = '', endDate = '', storeId = '') {
  const token = this.getToken();
  if (!token || !storeId) throw new Error('Sign in and select a store on the dashboard first.');
  const baseUrl = !Capacitor.isNativePlatform() && !environment.production
    ? window.location.origin + '/pch-orders-api'
    : environment.pchOrdersApiBaseUrl.replace(/\/+$/, '');
  const res = await CapacitorHttp.request({
    method: 'GET', url: baseUrl + '/orders/total-orders-count',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'x-store-id': storeId },
    params: { start_date: startDate, end_date: endDate }
  });
  const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (res.status < 200 || res.status >= 300 || body?.success !== true || !body?.data) {
    throw new Error(body?.message || 'Unable to load POS closing.');
  }
  return body;
}

async getDailyShiftSummary(startDate = '', endDate = '') {

  const token = localStorage.getItem('wc_token');
  this.wpBase = this.apiConfig.getBaseUrl();

  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/shifts/get-daily-shift-summary`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    },
    params: {
      start_date: startDate,
      end_date: endDate
    }
  });

  return typeof res.data === 'string'
    ? JSON.parse(res.data)
    : res.data;
}

async getShiftDetails(date: string) {

  const token = localStorage.getItem('wc_token');
  this.wpBase = this.apiConfig.getBaseUrl();

  const res = await CapacitorHttp.request({
    method: 'GET',
    url: `${this.wpBase}/wp-json/pinaka-pos/v1/shifts/shifts-by-date`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    },
    params: {
      date
    }
  });

  return typeof res.data === 'string'
    ? JSON.parse(res.data)
    : res.data;
}
}
