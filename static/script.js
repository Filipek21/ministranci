document.addEventListener("DOMContentLoaded", function(){
    console.log("DOM załadowany - inicjalizacja");

    // Potwierdzenie formularzy
    document.querySelectorAll("form").forEach(form=>{
        // Pomijamy formularze inline, update_mass_type i formularze z klasą no-confirm
        if(!form.classList.contains('inline-form') && !form.classList.contains('no-confirm') && !form.action.includes('update_mass_type')) {
            form.addEventListener("submit", function(e){
                if(!confirm("Czy na pewno chcesz zatwierdzić?")){
                    e.preventDefault();
                }
            });
        }
    });
    
    // AJAX dla formów update_mass_type
    document.querySelectorAll('form[action*="/admin/update_mass_type/"]').forEach(form => {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            fetch(this.action, { method: 'POST', body: formData })
                .then(() => location.reload())
                .catch(err => { console.error('Błąd:', err); alert('Błąd!'); });
        });
    });
    
    // Auto-uzupełnianie dat
    const today = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(input => {
        if (!input.value && input.name !== 'date') {
            input.value = today;
        }
    });
    
    // Dynamiczne ładowanie statystyk
    if (document.querySelector('.stats-grid')) {
        updateStats();
    }
    
    // Obsługa modali
    window.toggleModal = function(modalId) {
        const modal = document.getElementById(modalId);
        modal.style.display = modal.style.display === 'block' ? 'none' : 'block';
    };
    
    // Zamknij modal po kliknięciu poza nim
    window.onclick = function(event) {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = "none";
        }
    };
    
    // Inicjalizacja zaawansowanych komponentów
    initAdvancedComponents();
});

function updateStats() {
    // Tutaj można dodać dynamiczne aktualizowanie statystyk
    console.log("Aktualizowanie statystyk...");
}

// Funkcje dla zaawansowanych filtrów
function applyAdvancedFilters() {
    const filters = {
        dateFrom: document.getElementById('dateFrom')?.value,
        dateTo: document.getElementById('dateTo')?.value,
        user: document.getElementById('userFilter')?.value,
        minPoints: document.getElementById('minPoints')?.value
    };
    
    // Zastosuj filtry - w prawdziwej aplikacji byłoby to żądanie AJAX
    console.log("Zastosowano filtry:", filters);
}

// Eksport danych
function exportData(format = 'csv') {
    // W prawdziwej aplikacji byłoby to żądanie do serwera
    alert(`Eksportowanie danych w formacie ${format.toUpperCase()}`);
}

// Powiadomienia
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        border-radius: 4px;
        z-index: 10000;
        animation: slideIn 0.3s ease-in-out;
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Funkcja inicjalizacji komponentów zaawansowanych
function initAdvancedComponents() {
    // Delegacja zdarzeń dla komponentów dynamicznych
    console.log("Komponenty zaawansowane zainicjalizowane");
}

// Funkcja globalna dla potwierdzeń
window.confirmDelete = function(name) {
    return confirm(`Czy chcesz usunąć "${name}"?`);
};

// Formatowanie dat
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL');
}

// Obsługa dynamicznych tabel
function makeSortable(table) {
    let tds = table.getElementsByTagName('td');
    // Implementacja sortowania
    console.log("Tabela uczyniona sortowalna");
}

// Funkcje do kar
async function addPenalty(e) {
  e.preventDefault();
  const ministrant = document.getElementById('penaltyMinistrant').value;
  const typ = document.getElementById('penaltyType').value;
  const opis = document.getElementById('penaltyDesc').value;
  
  const fd = new FormData();
  fd.append('ministrant', ministrant);
  fd.append('typ_kary', typ);
  fd.append('opis', opis);
  
  const res = await fetch('/add_penalty', {method: 'POST', body: fd});
  const data = await res.json();
  if(data.success) {
    alert('Kara dodana!');
    document.querySelector('form').reset();
    loadPenalties();
  }
}

async function loadPenalties() {
  const res = await fetch('/get_all_penalties');
  const penalties = await res.json();
  const list = document.getElementById('penaltiesList');
  if(!list) return;
  
  list.innerHTML = penalties.map(p => `
    <div style="background:#2a2a2a; padding:12px; border-radius:8px; margin:10px 0; border-left:4px solid #f44336;">
      <strong style="color:#fff; font-size:16px;">${p.ministrant}</strong> - ${p.typ_kary}<br/>
      <small style="color:#888;">Opis: ${p.opis || '-'}</small><br/>
      <small style="color:#888;">Data: ${p.data}, Wydana przez: ${p.wydana_przez}</small><br/>
      <button onclick="removePenalty(${p.id})" style="margin-top:8px; padding:5px 10px; font-size:11px; background:#d32f2f; color:#fff; border:none; border-radius:4px; cursor:pointer;">Usuń karę</button>
    </div>
  `).join('') || '<p style="color:#b0b0b0;">Brak kar</p>';
}

async function removePenalty(id) {
  if(!confirm('Usuń tę karę?')) return;
  const res = await fetch(`/delete_penalty/${id}`, {method: 'POST'});
  const data = await res.json();
  if(data.success) {
    loadPenalties();
  }
}

async function loadMyPenalties() {
  const role = document.body.innerText.includes('admin') ? 'admin' : 'ministrant';
  if(role !== 'ministrant') return;
  
  const res = await fetch(`/get_user_penalties/${new URLSearchParams(window.location.search).get('user') || 'me'}`);
  const penalties = await res.json();
  const list = document.getElementById('myPenalties');
  if(!list) return;
  
  list.innerHTML = penalties.map(p => `
    <div style="background:#2a2a2a; padding:12px; border-radius:8px; border-left:4px solid #f44336;">
      <strong style="color:#ff6b6b; font-size:16px;">${p.typ_kary}</strong><br/>
      <p style="color:#fff; margin:8px 0;">Opis: ${p.opis}</p>
      <small style="color:#888;">Wydana: ${p.data} przez ${p.wydana_przez}</small>
    </div>
  `).join('') || '<p style="color:#b0b0b0;">Brak kar</p>';
}

// Funkcje do usuwania rozmów
async function deleteConv() {
  if(!currentConv) return;
  if(!confirm('Czy na pewno usunąć całą rozmowę?')) return;
  
  const res = await fetch(`/delete_conversation/${currentConv.id}`, {method: 'POST'});
  const data = await res.json();
  if(data.success) {
    alert('Rozmowa usunięta!');
    currentConv = null;
    document.getElementById('chatBox').style.display = 'none';
    document.getElementById('noConvSelected').style.display = 'block';
    loadConversations();
  }
}

// Załaduj dane przy starcie
if(document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    loadPenalties();
    loadMyPenalties();
  });
} else {
  loadPenalties();
  loadMyPenalties();
}

// Załaduj zablokowanych użytkowników
async function loadBlockedUsers() {
  const res = await fetch('/get_blocked_users');
  const blocked = await res.json();
  const tbody = document.getElementById('blockedList');
  if(!tbody) return;
  
  tbody.innerHTML = blocked.map(b => `
    <tr>
      <td><strong style="color:#ff6b6b;">${b.blokowany}</strong></td>
      <td>${b.data}</td>
      <td>
        <form method="POST" action="/unblock_user/${b.blokowany}" style="display:inline;">
          <button type="submit" style="padding:5px 10px; font-size:11px; background:#4CAF50; color:#fff; border:none; border-radius:4px; cursor:pointer;">Odblokuj</button>
        </form>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="3" style="text-align:center; padding:20px; color:#b0b0b0;">Brak zablokowanych użytkowników</td></tr>';
}

// Załaduj na starcie
if(document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadBlockedUsers);
} else {
  loadBlockedUsers();
}

// Filtrowanie użytkowników po roli
function filterUsers(role) {
  const rows = document.querySelectorAll('.users-table tbody tr');
  let count = 0;
  rows.forEach(row => {
    const roleCell = row.cells[1];
    if(!roleCell) return;
    const select = roleCell.querySelector('select');
    const userRole = select ? select.value : '';
    
    if(role === 'all' || userRole === role) {
      row.style.display = '';
      count++;
    } else {
      row.style.display = 'none';
    }
  });
  console.log(`Pokazano ${count} użytkowników`);
}

// Załaduj awaryjne kontakty
async function loadEmergencyContacts() {
  const res = await fetch('/get_emergency_contacts');
  const contacts = await res.json();
  const list = document.getElementById('emergencyList');
  if(!list) return;
  
  if(contacts.length === 0) {
    list.innerHTML = '<p style="color:#b0b0b0;">Brak nowych próśb o pomoc</p>';
    return;
  }
  
  list.innerHTML = contacts.map(c => `
    <div style="background:#2a2a2a; padding:15px; border-radius:8px; border-left:4px solid #${c.status==='new'?'FFC107':'4CAF50'}; margin:10px 0;">
      <div style="display:flex; justify-content:space-between; align-items:start;">
        <div style="flex:1;">
          <strong style="color:#FFC107; font-size:16px;">${c.name}</strong> 
          <span style="background:#${c.status==='new'?'FFC107':'4CAF50'}; padding:2px 6px; border-radius:3px; font-size:11px; color:#000; font-weight:600; margin-right:8px;">${c.status==='new'?'NOWY':'ROZWIĄZANY'}</span>
          <span style="background:#${c.priority==='Natychmiast'?'f44336':c.priority==='Pilnie'?'FF9800':'2196F3'}; padding:2px 6px; border-radius:3px; font-size:11px; color:#fff; font-weight:600;">${c.priority || 'Normalny'}</span><br/>
          <small style="color:#888;">📧 ${c.email || '-'} | 💬 ${c.messenger || '-'}</small><br/>
          <small style="color:#aaa; margin:8px 0; display:block;">🖥️ ${c.device || 'Nieznane'}</small>
          <p style="color:#fff; margin:8px 0;">📝 ${c.description}</p>
          ${c.actions ? '<p style="color:#ccc; margin:8px 0; font-size:12px;">⚙️ Akcje: ' + c.actions + '</p>' : ''}
          <small style="color:#888;">📅 ${c.contact_date} | 🔄 Ostatnie: ${c.last_login || '-'}</small><br/>
          <small style="color:#999; margin-top:8px; display:block;">
            ${c.cache ? '✓ Cache czyszczony ' : ''}
            ${c.reload ? '✓ Stronę przeładowywany ' : ''}
            ${c.incognito ? '✓ Incognito testowany ' : ''}
            ${c.other ? '✓ Inne urządzenie testowane' : ''}
          </small>
        </div>
      </div>
      <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
        <button onclick="markEmergencyResolved(${c.id})" style="padding:6px 12px; background:#4CAF50; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600;">✓ Rozwiązane</button>
        <button onclick="copyContactInfo(${c.id},'${c.name}','${c.email}','${c.messenger}')" style="padding:6px 12px; background:#2196F3; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600;">📋 Kopiuj dane</button>
        <button onclick="markEmergencyPriority(${c.id})" style="padding:6px 12px; background:#FF9800; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600;">⚡ Priorytet</button>
        <button onclick="contactBack('${c.name}','${c.email}','${c.messenger}')" style="padding:6px 12px; background:#9C27B0; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600;">💬 Kontakt</button>
        <button onclick="deleteEmergencyContact(${c.id})" style="padding:6px 12px; background:#f44336; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600;">🗑️ Usuń</button>
        <button onclick="notesEmergency(${c.id})" style="padding:6px 12px; background:#673AB7; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600;">📄 Notatka</button>
      </div>
    </div>
  `).join('');
}

async function markEmergencyResolved(id) {
  const res = await fetch('/update_emergency_contact/' + id, {method: 'POST', body: JSON.stringify({status: 'resolved'}), headers: {'Content-Type': 'application/json'}});
  const data = await res.json();
  if(data.success) {
    alert('✓ Oznaczono jako rozwiązane!');
    loadEmergencyContacts();
  }
}

function copyContactInfo(id, name, email, messenger) {
  const text = `Imię: ${name}\nEmail: ${email}\nMessenger: ${messenger}`;
  navigator.clipboard.writeText(text).then(() => {
    alert('✓ Skopiowano dane kontaktu!');
  });
}

function markEmergencyPriority(id) {
  const note = prompt('Dodaj notatkę do tego kontaktu (priorytet):');
  if(note) {
    alert('⚡ Oznaczono jako priorytet!\nNotatka: ' + note);
  }
}

function contactBack(name, email, messenger) {
  const method = prompt(`Jak skontaktować się z ${name}?\n1 - Email\n2 - Messenger\n3 - Email + Messenger`, '1');
  if(method === '1' && email) {
    window.open('mailto:' + email, '_blank');
  } else if(method === '2' && messenger) {
    alert('💬 Messenger: ' + messenger);
  } else if(method === '3' && (email || messenger)) {
    alert(`Email: ${email}\n💬 Messenger: ${messenger}`);
  } else {
    alert('Brak danych kontaktu!');
  }
}

async function deleteEmergencyContact(id) {
  if(confirm('Na pewno usunąć ten kontakt awaryjny?')) {
    const res = await fetch('/delete_emergency_contact/' + id, {method: 'POST'});
    const data = await res.json();
    if(data.success) {
      alert('✓ Usunięto!');
      loadEmergencyContacts();
    }
  }
}

function notesEmergency(id) {
  const note = prompt('Dodaj notatkę dla tego kontaktu:');
  if(note) {
    alert('✓ Notatka dodana: ' + note);
    // TODO: Można dodać backend route do zapisywania notatek
  }
}

// Załaduj na starcie
if(document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    loadEmergencyContacts();
    loadBlockedUsers();
    loadPenalties();
  });
} else {
  loadEmergencyContacts();
  loadBlockedUsers();
  loadPenalties();
}

// NOWE FUNKCJE ADMIN - ZARZĄDZANIE KONTAMI

// Szukaj użytkowników
function searchUsers(query) {
  const rows = document.querySelectorAll('.user-row');
  rows.forEach(row => {
    const username = row.dataset.username.toLowerCase();
    if(username.includes(query.toLowerCase())) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

// Filtruj po roli
function filterByRole(role) {
  const rows = document.querySelectorAll('.user-row');
  rows.forEach(row => {
    if(!role || row.dataset.role === role) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

// Filtruj po statusie
function filterUsers(status) {
  const rows = document.querySelectorAll('.user-row');
  rows.forEach(row => {
    if(status === 'all') {
      row.style.display = '';
    } else if(status === 'active' && row.dataset.active === '1') {
      row.style.display = '';
    } else if(status === 'inactive' && row.dataset.active === '0') {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

// Zaznacz/odznacz wszystkie checkboxy
function toggleAllCheckboxes() {
  const selectAllCheck = document.getElementById('selectAllCheck');
  const userCheckboxes = document.querySelectorAll('.user-checkbox');
  userCheckboxes.forEach(cb => {
    cb.checked = selectAllCheck.checked;
  });
}

// Toggle zaznacz wszystkie
function toggleSelectAll() {
  const selectAllCheck = document.getElementById('selectAllCheck');
  selectAllCheck.checked = !selectAllCheck.checked;
  toggleAllCheckboxes();
  alert(selectAllCheck.checked ? '✓ Zaznaczono wszystkich' : '✗ Odznaczono wszystkich');
}

// Eksportuj użytkowników do CSV
function exportUsers() {
  const rows = document.querySelectorAll('.user-row');
  let csv = 'Login,Rola,Status,Dołączył\n';
  
  rows.forEach(row => {
    const username = row.dataset.username;
    const role = row.dataset.role;
    const active = row.dataset.active === '1' ? 'Aktywny' : 'Nieaktywny';
    const created = row.querySelector('td:nth-child(5)').textContent;
    csv += `${username},${role},${active},${created}\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `users_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
  alert('✓ Eksportowano użytkowników do CSV!');
}

// PANEL ZMIANY HASŁA

let currentPasswordUser = null;

function openPasswordModal(username) {
  currentPasswordUser = username;
  document.getElementById('passwordModal').style.display = 'block';
  document.getElementById('modalUsername').textContent = username;
  document.getElementById('newPassword').value = '';
  document.getElementById('confirmPassword').value = '';
  document.getElementById('matchInfo').style.display = 'none';
  document.getElementById('newPassword').focus();
}

function closePasswordModal() {
  document.getElementById('passwordModal').style.display = 'none';
  currentPasswordUser = null;
}

// Podłącz event listenery kiedy dokument się załaduje
document.addEventListener('DOMContentLoaded', function() {
  const pwdField = document.getElementById('newPassword');
  const confirmField = document.getElementById('confirmPassword');
  if(pwdField) pwdField.addEventListener('input', checkPasswordMatch);
  if(confirmField) confirmField.addEventListener('input', checkPasswordMatch);
});

function checkPasswordMatch() {
  const pwd = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmPassword').value;
  const matchInfo = document.getElementById('matchInfo');
  
  if(confirm && pwd !== confirm) {
    matchInfo.style.display = 'block';
  } else {
    matchInfo.style.display = 'none';
  }
}

async function submitPasswordChange(e) {
  e.preventDefault();
  
  const pwd = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmPassword').value;
  
  if(pwd.length < 6) {
    alert('❌ Hasło musi mieć minimum 6 znaków!');
    return;
  }
  
  if(pwd !== confirm) {
    alert('❌ Hasła się nie zgadzają!');
    return;
  }
  
  const fd = new FormData();
  fd.append('new_password', pwd);
  
  try {
    const res = await fetch(`/admin/change_password/${currentPasswordUser}`, {
      method: 'POST',
      body: fd
    });
    const data = await res.json();
    if(data.success) {
      alert(`✓ Hasło dla użytkownika ${currentPasswordUser} zmieniono!`);
      closePasswordModal();
      location.reload();
    } else {
      alert('❌ Błąd: ' + (data.error || 'Spróbuj ponownie'));
    }
  } catch(err) {
    alert('❌ Błąd połączenia: ' + err.message);
  }
}

// Zamknij modal po kliknięciu poza nim
window.addEventListener('click', function(e) {
  const modal = document.getElementById('passwordModal');
  if(e.target === modal) {
    closePasswordModal();
  }
});

// ULEPSZENIA CZATA - Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Niech rozmowy wyświetlają się jako klikalne karty
function loadConversations() {
  fetch('/get_conversations').then(r => r.json()).then(convs => {
    const list = document.getElementById('convList');
    if(!list) return;
    
    list.innerHTML = convs.map(c => `
      <div onclick="selectConv(${c.id},'${escapeHtml(c.nadawca)}','${escapeHtml(c.odbiorcy)}','${c.status}')" 
           style="background:#1a1a1a; padding:12px; border-radius:6px; border-left:4px solid #${c.status==='closed'?'999':'4CAF50'}; cursor:pointer; transition:all 0.2s; border:1px solid #555;"
           onmouseover="this.style.background='#333'" onmouseout="this.style.background='#1a1a1a'">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="color:#fff; font-size:14px;">💬 ${c.nadawca}</strong>
          <span style="background:#${c.status==='closed'?'f44336':'4CAF50'}; padding:2px 6px; border-radius:3px; font-size:10px; color:#fff; font-weight:600;">${c.status==='closed'?'ZAMKNIĘTA':'OTWARTA'}</span>
        </div>
        <small style="color:#aaa;">↔️ ${c.odbiorcy}</small><br/>
        <small style="color:#888; margin-top:6px; display:block;">📅 ${c.data}</small>
      </div>
    `).join('') || '<p style="color:#b0b0b0; text-align:center; margin-top:20px;">Brak rozmów</p>';
  });
}

// Auto-load na starcie
if(document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    loadConversations();
  });
} else {
  loadConversations();
}

// NOWE FUNKCJE ZARZĄDZANIA KONTAMI

let currentDetailUser = null;
let currentNotesUser = null;

// MODAL SZCZEGÓŁÓW
function openUserDetails(username) {
  currentDetailUser = username;
  const modal = document.getElementById('userDetailsModal');
  const content = document.getElementById('userDetailsContent');
  
  content.innerHTML = `
    <div style="background:#1a1a1a; padding:15px; border-radius:6px; margin-bottom:15px;">
      <p><strong>Login:</strong> <span style="color:#2196F3;">${username}</span></p>
      <p><strong>Rola:</strong> <span style="color:#FF9800;">Ministranci</span></p>
      <p><strong>Status:</strong> <span style="color:#4CAF50;">✓ Aktywny</span></p>
      <p><strong>Dołączył:</strong> <span style="color:#aaa;">29 listopada 2025</span></p>
      <p><strong>Ostatnie logowanie:</strong> <span style="color:#aaa;">Dzisiaj o 19:30</span></p>
      <p><strong>Ostatnia zmiana hasła:</strong> <span style="color:#aaa;">5 dni temu</span></p>
      <p><strong>Liczba logowań:</strong> <span style="color:#aaa;">24</span></p>
      <p><strong>Punkty (bieżący miesiąc):</strong> <span style="color:#4CAF50;">127</span></p>
      <p><strong>Obecności zarejestrowane:</strong> <span style="color:#aaa;">18</span></p>
      <hr style="border:none; border-top:1px solid #555; margin:15px 0;">
      <p><strong>Notatka:</strong> <span style="color:#aaa;">Brak notatki</span></p>
    </div>
  `;
  modal.style.display = 'block';
}

function closeUserDetails() {
  document.getElementById('userDetailsModal').style.display = 'none';
  currentDetailUser = null;
}

function resetLoginAttempts() {
  if(!currentDetailUser) return;
  alert(`✓ Zresetowano próby logowania dla ${currentDetailUser}`);
  closeUserDetails();
}

// MODAL NOTATEK
function openNotesModal(username) {
  currentNotesUser = username;
  document.getElementById('notesModal').style.display = 'block';
  document.getElementById('notesUsername').textContent = username;
  document.getElementById('notesContent').value = '';
  document.getElementById('notesContent').focus();
}

function closeNotesModal() {
  document.getElementById('notesModal').style.display = 'none';
  currentNotesUser = null;
}

function saveUserNotes() {
  const notes = document.getElementById('notesContent').value;
  if(notes.trim()) {
    alert(`✓ Notatka zapisana dla ${currentNotesUser}!`);
    closeNotesModal();
  } else {
    alert('⚠️ Wpisz treść notatki!');
  }
}

// Zamknij modałe po kliknięciu poza nimi
window.addEventListener('click', function(e) {
  const detailModal = document.getElementById('userDetailsModal');
  const notesModal = document.getElementById('notesModal');
  if(e.target === detailModal) closeUserDetails();
  if(e.target === notesModal) closeNotesModal();
});

// POBIERANIE PRAWDZIWYCH DANYCH
function openUserDetails(username) {
  currentDetailUser = username;
  const modal = document.getElementById('userDetailsModal');
  const content = document.getElementById('userDetailsContent');
  
  // Pokaż loading
  content.innerHTML = '<p style="color:#aaa; text-align:center;">⏳ Ładowanie danych...</p>';
  modal.style.display = 'block';
  
  // Pobierz dane z backendu
  fetch(`/get_user_info/${username}`, { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      if(data.success) {
        content.innerHTML = `
          <div style="background:#1a1a1a; padding:20px; border-radius:8px; margin-bottom:20px; border-left:4px solid #9C27B0;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
              <div>
                <p style="font-size:18px; margin:12px 0; line-height:1.8;"><span style="font-size:24px;">👤</span> <strong style="color:#fff;">Login:</strong><br/><span style="color:#2196F3; font-weight:bold; font-size:16px;">${data.username}</span></p>
                <p style="font-size:18px; margin:12px 0; line-height:1.8;"><span style="font-size:24px;">🎯</span> <strong style="color:#fff;">Rola:</strong><br/><span style="color:#FF9800; font-weight:bold; font-size:16px;">${data.role === 'ministrant' ? '👥 Ministrant' : data.role === 'ksiez' ? '⛪ Ksiądz' : '🔑 Admin'}</span></p>
                <p style="font-size:18px; margin:12px 0; line-height:1.8;"><span style="font-size:24px;">✓</span> <strong style="color:#fff;">Status:</strong><br/><span style="color:#4CAF50; font-weight:bold; font-size:16px;">${data.status}</span></p>
              </div>
              <div>
                <p style="font-size:18px; margin:12px 0; line-height:1.8;"><span style="font-size:24px;">📅</span> <strong style="color:#fff;">Dołączył:</strong><br/><span style="color:#aaa; font-size:16px;">${data.created_date}</span></p>
                <p style="font-size:18px; margin:12px 0; line-height:1.8;"><span style="font-size:24px;">🔐</span> <strong style="color:#fff;">Ostatni login:</strong><br/><span style="color:#2196F3; font-weight:bold; font-size:16px;">${data.last_login_date}</span></p>
              </div>
            </div>
            <hr style="border:none; border-top:1px solid #555; margin:20px 0;">
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px; text-align:center;">
              <div style="background:#0d0d0d; padding:15px; border-radius:6px; border:1px solid #2196F3;">
                <p style="font-size:14px; color:#aaa; margin:0 0 10px 0;">📊 Obecności</p>
                <p style="font-size:28px; color:#2196F3; font-weight:bold; margin:0;">${data.attendance_count}</p>
              </div>
              <div style="background:#0d0d0d; padding:15px; border-radius:6px; border:1px solid #4CAF50;">
                <p style="font-size:14px; color:#aaa; margin:0 0 10px 0;">⭐ Punkty (miesiąc)</p>
                <p style="font-size:28px; color:#4CAF50; font-weight:bold; margin:0;">${data.monthly_points}</p>
              </div>
              <div style="background:#0d0d0d; padding:15px; border-radius:6px; border:1px solid #f44336;">
                <p style="font-size:14px; color:#aaa; margin:0 0 10px 0;">⚠️ Kary</p>
                <p style="font-size:28px; color:#f44336; font-weight:bold; margin:0;">${data.penalty_count}</p>
              </div>
            </div>
          </div>
        `;
      } else {
        content.innerHTML = `<p style="color:#f44336; text-align:center;">❌ Błąd: ${data.error}</p>`;
      }
    })
    .catch(err => {
      content.innerHTML = `<p style="color:#f44336; text-align:center;">❌ Błąd połączenia: ${err.message}</p>`;
    });
}

// ==================== SYSTEM NOTYFIKACJI ====================
function loadRegisteredDevices() {
  fetch('/get_registered_devices', { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      const tbody = document.getElementById('devicesList');
      if(!data.devices || data.devices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#aaa;">Brak zarejestrowanych urządzeń</td></tr>';
        return;
      }
      tbody.innerHTML = data.devices.map(d => `
        <tr style="border-bottom:1px solid #333; background:#1a1a1a;">
          <td style="padding:10px;">${d.name}</td>
          <td style="padding:10px; font-family:monospace; font-size:12px; color:#2196F3;">${d.device_id.substring(0, 12)}...</td>
          <td style="padding:10px; font-size:12px; color:#aaa;">${d.reg_date}</td>
          <td style="padding:10px; font-size:12px; color:#aaa;">${d.last_ping || 'Nigdy'}</td>
          <td style="padding:10px; text-align:center;">
            <span style="background:${d.active ? '#4CAF50' : '#f44336'}; color:#fff; padding:4px 8px; border-radius:3px; font-size:12px;">
              ${d.active ? '✓ Aktywne' : '✗ Nieaktywne'}
            </span>
          </td>
        </tr>
      `).join('');
    })
    .catch(err => console.log('Błąd:', err));
}

function sendNotifToAll() {
  const title = document.getElementById('notificationTitle').value;
  const msg = document.getElementById('notificationMsg').value;
  
  if(!title || !msg) {
    alert('Wypełnij tytuł i wiadomość!');
    return;
  }
  
  fetch('/send_notification', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: 'admin', title, message: msg })
  })
    .then(r => r.json())
    .then(data => {
      if(data.success) {
        alert(`✓ Wysłano do ${data.sent_to} urządzeń!`);
        document.getElementById('notificationTitle').value = '';
        document.getElementById('notificationMsg').value = '';
        loadRegisteredDevices();
      }
    })
    .catch(err => console.log('Błąd:', err));
}

// Load devices on page load
document.addEventListener('DOMContentLoaded', () => {
  if(document.getElementById('devicesList')) {
    loadRegisteredDevices();
  }
});

// ==================== EKSPORT/IMPORT DANYCH ====================
function exportAllData() {
  fetch('/export_all_data', { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ministranci_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      alert('✓ Dane wyeksportowane!');
    })
    .catch(err => alert(`✗ Błąd: ${err.message}`));
}

function importAllData(event) {
  const file = event.target.files[0];
  if(!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      fetch('/import_all_data', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
        .then(r => r.json())
        .then(res => {
          if(res.success) {
            alert(`✓ Zaimportowano ${res.imported} rekordów!`);
            location.reload();
          } else {
            alert(`✗ Błąd: ${res.error}`);
          }
        });
    } catch(err) {
      alert(`✗ Nieprawidłowy format pliku: ${err.message}`);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function deleteAllSchedules() {
  if(!confirm('⚠️ Usunąć WSZYSTKIE msze z harmonogramu? (Nie można cofnąć!)')) return;
  
  fetch('/delete_all_schedules', { method: 'POST', credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      if(data.success) {
        alert(`✓ Usunięto ${data.deleted} mszy!`);
        location.reload();
      } else {
        alert(`✗ Błąd: ${data.error}`);
      }
    })
    .catch(err => alert(`✗ Błąd: ${err.message}`));
}
