import { Component } from '@angular/core';
import { AuthService } from 'src/app/services/auth/auth.service';
import { ModalController,NavController } from '@ionic/angular';
import { AddUserComponent } from './modals/add-user/add-user.component';
import { AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { LoadingController } from '@ionic/angular';
import { ToastController } from '@ionic/angular';

@Component({
    selector: 'app-users-list',
    templateUrl: './users-list.page.html',
    styleUrls: ['./users-list.page.scss'],
    standalone: false
})
export class UsersListPage {

  users: any[] = [];
  filteredUsers: any[] = [];
  assignedEmployees: any[] = [];
  selectedStoreName = '';
  savingAssignments = new Set<string>();
  assignmentMode = false;

  editingUserId: string | number | null = null;
  editedUser: any = {};
  originalUser: any = {};
  isChanged = false;
  customRoles: any[] = [];
  isUsernameLocked = false;
  loading = false;
  loadError = '';
  private employeeRequestId = 0;
  private employeeContext = '';
  private employeeSearch = '';
  popupShown = false;
  private searchTimeout: any;
  usernameTouched = false;
firstNameTouched = false;
lastNameTouched = false;

  constructor(
  private authService: AuthService,
  private modalCtrl: ModalController,
  private navCtrl: NavController,
  private alertCtrl: AlertController,
  private router: Router,
  private toastCtrl: ToastController
) {}

containsEmoji(text: string): boolean {
  if (!text) return false;

  return /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu.test(text);
}

removeEmojis(value: string): string {

  return value.replace(
    /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDFFF])/g,
    ''
  );
}

onUsernameInput(event: any) {

  const value =
    event.target.value || '';

  const cleaned =
    this.removeEmojis(value);

  this.editedUser.username =
    cleaned;

  event.target.value =
    cleaned;

  this.checkChanges();
}

onFirstNameInput(event: any) {

  const value =
    event.target.value || '';

  const cleaned =
    this.removeEmojis(value);

  this.editedUser.first_name =
    cleaned;

  event.target.value =
    cleaned;

  this.checkChanges();
}

onLastNameInput(event: any) {

  const value =
    event.target.value || '';

  const cleaned =
    this.removeEmojis(value);

  this.editedUser.last_name =
    cleaned;

  event.target.value =
    cleaned;

  this.checkChanges();
}

async ngOnInit() {

  try {

    const state = history.state;

    history.replaceState({}, '');

    await this.loadUsers();
    if (!this.authService.isMerchantSession()) this.customRoles = await this.authService.getCustomRoles();

  } catch (error) {
    console.error(error);
  }
}
  async openAddEmployee() {
    this.checktoken();
  const modal = await this.modalCtrl.create({
    component: AddUserComponent,
    componentProps: {
      userRole: 'employee'
    }
  });

  await modal.present();

  // wait until modal closes
  const { data } = await modal.onDidDismiss();

  // if employee created successfully
  if (data === true) {
    await this.loadUsers();   // reload employee list
  }

}

editEmployee(user: any) {

  this.checktoken();  
  this.editingUserId = this.employeeId(user);
  const storeAssignment = this.assignedEmployees.find(item => String(item.employeeId) === this.employeeId(user));
  const assignedRoleId = String(storeAssignment?.roleTemplateId || user.roleTemplateId || user.roleId || user.roles?.[0] || '');
  const matchingRole = this.customRoles.find(role => String(role.key) === assignedRoleId || String(role.sourceKey) === assignedRoleId);

  this.editedUser = {
    username: user.username,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    role: matchingRole?.key || assignedRoleId,
    phone: user.meta?.user_phone || '',
    emp_login_pin: storeAssignment?.loginPin || ''
  };

  this.originalUser = { ...this.editedUser };

  // 🔒 lock username if already exists
  this.isUsernameLocked = !!user.username;

}

  toggleAssignmentMode() { this.assignmentMode = !this.assignmentMode; }

  get assignedEmployeeCount(): number { return this.assignedEmployees.length; }

  employeeId(user: any): string { return String(user?.employeeId || user?.employee_id || user?.id || ''); }

  isAssigned(user: any): boolean {
    return this.assignedEmployees.some(item => String(item.employeeId) === this.employeeId(user));
  }

  async toggleStoreAssignment(user: any, event: Event) {
    const input = event.target as HTMLInputElement;
    const id = this.employeeId(user);
    if (!id || this.savingAssignments.has(id)) { input.checked = this.isAssigned(user); return; }
    const existing = this.assignedEmployees.find(item => String(item.employeeId) === id);
    const next = input.checked
      ? [...this.assignedEmployees, { employeeId: id, roleTemplateId: this.customRoles[0]?.key || '' }]
      : this.assignedEmployees.filter(item => String(item.employeeId) !== id);
    this.savingAssignments = new Set(this.savingAssignments).add(id);
    try {
      const merchantId = JSON.parse(localStorage.getItem('merchant_data') || 'null')?.id || '';
      const storeId = JSON.parse(localStorage.getItem('selected_store') || 'null')?.id || '';
      await this.authService.savePchStoreEmployeeAssignments(merchantId, storeId, next);
      this.assignedEmployees = next;
      const toast = await this.toastCtrl.create({ message: input.checked ? 'Employee mapped to this store' : 'Employee unmapped from this store', duration: 1600, position: 'bottom', color: 'success' });
      await toast.present();
    } catch (error: any) {
      input.checked = !!existing;
      const toast = await this.toastCtrl.create({ message: error?.message || 'Unable to update store assignment', duration: 2500, position: 'bottom', color: 'danger' });
      await toast.present();
    } finally {
      const pending = new Set(this.savingAssignments); pending.delete(id); this.savingAssignments = pending;
    }
  }
  
  checkChanges() {
    this.isChanged =
      JSON.stringify(this.originalUser) !==
      JSON.stringify(this.editedUser);
  }
  
  async saveChanges() {

    if (this.editedUser.emp_login_pin && !this.isValidPin(this.editedUser.emp_login_pin)) {
      this.pinTouched = true;
      return;
    }

    if (
  this.containsEmoji(this.editedUser.username) ||
  this.containsEmoji(this.editedUser.email) ||
  this.containsEmoji(this.editedUser.first_name) ||
  this.containsEmoji(this.editedUser.last_name)
) {
  this.showAlert(
    'Validation Error',
    'Username, Email, First Name and Last Name cannot contain emojis'
  );
  return;
}
    try {

      const payload: any = {
      username: this.editedUser.username,
      email: this.editedUser.email,
      first_name: this.editedUser.first_name,
      last_name: this.editedUser.last_name,
      phone: this.editedUser.phone,
      login_pin: this.editedUser.emp_login_pin
    };
      const storeId = JSON.parse(localStorage.getItem('selected_store') || 'null')?.id || '';
      const response = await this.authService.updatePchMerchantEmployee(this.editingUserId!, storeId, payload);
      if (this.isAssigned({ id: this.editingUserId }) && this.editedUser.role) {
        const employeeId = String(this.editingUserId);
        const nextAssignments = this.assignedEmployees.map(item => String(item.employeeId) === employeeId
          ? {
              ...item,
              roleTemplateId: this.editedUser.role,
              ...(this.editedUser.emp_login_pin ? { loginPin: String(this.editedUser.emp_login_pin) } : {})
            }
          : item);
        await this.authService.savePchStoreEmployeeAssignments(
          JSON.parse(localStorage.getItem('merchant_data') || 'null')?.id || '', storeId, nextAssignments);
        this.assignedEmployees = nextAssignments;
      }
      if (response?.success || response?.employee || response?.id) {
        this.editingUserId = null;
        await this.loadUsers();
      } else {
        throw { error: response || { message: 'An unknown error occurred' } };
      }

    } catch (e: any) {
      console.log('FULL ERROR 👉', e);
      console.log('ERROR BODY 👉', e.error);

      let message =
        e?.error?.message ||
        e?.error?.data?.message ||
        e?.error?.error ||
        e?.message ||
        JSON.stringify(e?.error || e);

      console.log('FINAL MESSAGE 👉', message);

      if (typeof message === 'string' && message.toLowerCase().includes('pin')) {
        this.showAlert('Error', message);
      } else {
        // If it's another error, don't blindly assume it's a PIN error.
        let errorMsg = typeof message === 'string' ? message : 'An error occurred while updating the employee';
        // Clean up stringified objects if we just get {}
        if (errorMsg === '{}') errorMsg = 'An error occurred while updating the employee';
        
        this.showAlert('Error', errorMsg);
      }
    }
  }

  async showAlert(header: string, message: string) {
    const alert = await this.alertCtrl.create({
      header,
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }
  // ✅ Cancel Edit
  cancelEdit() {
  this.editingUserId = null;
  this.editedUser = {};
  this.originalUser = {};
  this.isChanged = false;
  this.isUsernameLocked = false; // reset
}

  // ✅ Debounced Search
  onSearch(event: any) {
    const value = String(event?.target?.value || '').trim().toLowerCase();
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.employeeSearch = value;
      this.filterEmployees();
    }, 300);
  }

  private filterEmployees() {
    const search = this.employeeSearch;
    this.filteredUsers = this.users.filter(user => !search ||
      [user.first_name, user.last_name, [user.first_name, user.last_name].join(' '), user.email, user.employeeCode, user.username]
        .some(value => String(value || '').toLowerCase().includes(search)));
  }

  ionViewWillEnter() { void this.loadUsers(); }

  async loadUserForEdit(id: number) {
    try {
      const user = await this.authService.getUserById(id);

      this.editedUser = { ...user };
      this.originalUser = { ...user };

    } catch (error) {
      console.error('Error loading user', error);
    }
  }

  async loadUsers() {
    let merchantId = '';
    let storeId = '';
    try {
      merchantId = JSON.parse(localStorage.getItem('merchant_data') || 'null')?.id || '';
      storeId = JSON.parse(localStorage.getItem('selected_store') || 'null')?.id || '';
    } catch {}
    const context = merchantId + ':' + storeId;
    if (this.loading && this.employeeContext === context) return;
    const requestId = ++this.employeeRequestId;
    this.employeeContext = context;
    this.loading = true;
    this.loadError = '';
    this.users = [];
    this.filteredUsers = [];
    try {
      const [users, assignments, roles] = await Promise.all([
        this.authService.getPchMerchantEmployees(merchantId),
        this.authService.getPchStoreEmployeeAssignments(merchantId, storeId),
        this.authService.getPchMerchantRoles(merchantId)
      ]);
      if (requestId !== this.employeeRequestId) return;
      this.users = users;
      this.assignedEmployees = assignments;
      try { this.selectedStoreName = JSON.parse(localStorage.getItem('selected_store') || 'null')?.name || JSON.parse(localStorage.getItem('selected_store') || 'null')?.store_name || 'Selected store'; } catch { this.selectedStoreName = 'Selected store'; }
      this.filterEmployees();
      // The PCH employee screen offers only role templates currently used for
      // this store. The merchant-wide available-role endpoint can return more,
      // so scope its results to this store's assignment role IDs.
      const storeRoleIds = new Set(assignments
        .map((assignment: any) => String(assignment.roleTemplateId || ''))
        .filter(Boolean));
      const storeRoles = roles.filter((role: any) =>
        storeRoleIds.has(String(role.key)) || (role.sourceKey && storeRoleIds.has(String(role.sourceKey)))
      );
      this.customRoles = storeRoles;
    } catch (error: any) {
      if (requestId === this.employeeRequestId) this.loadError = error?.message || 'Unable to load employees. Please try again.';
    } finally {
      if (requestId === this.employeeRequestId) this.loading = false;
    }
  }

  getRoleLabel(roles: string[]) {
    if (!Array.isArray(roles) || roles.length === 0) return '';
    return roles[0].replace('_', ' ');
  }

  getEmployeeRoleLabel(user: any): string {
    const assignment = this.assignedEmployees.find(item => String(item.employeeId) === this.employeeId(user));
    const roleId = String(assignment?.roleTemplateId || user?.roleTemplateId || user?.roleId || user?.role_id || user?.roles?.[0] || '');
    const roleName = user?.roleName || user?.role_name || user?.role?.name || user?.roles?.[0]?.name;
    if (roleName) return String(roleName);
    const mappedRole = this.customRoles.find(role => String(role.key) === roleId || String(role.sourceKey) === roleId || String(role.id) === roleId);
    if (mappedRole?.name) return String(mappedRole.name);
    return roleId ? roleId.replace(/[_-]+/g, ' ') : 'Unassigned';
  }
  
  emailTouched = false;
phoneTouched = false;
pinTouched = false;

isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

isValidPhone(phone: string): boolean {
  return /^[0-9]{10}$/.test(phone);
}

isValidPin(pin: string): boolean {
  return /^[0-9]{6}$/.test(pin);
}

limitPinLength(event: any) {
  const value = event.target.value || '';
  this.editedUser.emp_login_pin = value.replace(/\D/g, '').slice(0, 6);
  event.target.value = this.editedUser.emp_login_pin;
}

limitPhoneLength(event: any) {
  const value = event.target.value || '';
  this.editedUser.phone = value.replace(/\D/g, '').slice(0, 10);
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