// script.js – Shared reports via Supabase (50 MB file limit for free tier)

let reports = [];

// Load all reports from Supabase
async function loadReports() {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) {
    console.error('Error fetching reports:', error.message);
    document.getElementById('reportsList').innerHTML = 
      '<p class="text-center text-red-600 py-12">Error loading reports. Check console.</p>';
    return;
  }

  reports = data || [];
  renderReports();
}

// Render reports list
function renderReports(filter = '') {
  const container = document.getElementById('reportsList');
  const lowerFilter = filter.toLowerCase();

  const filtered = reports.filter(r =>
    !lowerFilter ||
    (r.username || '').toLowerCase().includes(lowerFilter) ||
    (r.reason || '').toLowerCase().includes(lowerFilter) ||
    (r.details || '').toLowerCase().includes(lowerFilter)
  );

  if (filtered.length === 0) {
    container.innerHTML = `<p class="text-center text-gray-500 py-12">No reports found${filter ? ` matching "${filter}"` : ''}</p>`;
    return;
  }

  container.innerHTML = filtered.map(r => {
    const date = new Date(r.timestamp).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });

    return `
      <div class="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md transition">
        <div class="flex justify-between items-start mb-3">
          <div>
            <span class="font-semibold text-lg">${r.username || 'Unknown'}</span>
            <span class="ml-3 text-xs px-3 py-1 rounded-full bg-gray-200 text-gray-700">${r.reason || 'Other'}</span>
          </div>
          <span class="text-xs text-gray-500">${date}</span>
        </div>
        
        <p class="text-gray-700 leading-relaxed mb-4">${r.details || ''}</p>
        
        ${r.evidence?.length ? `
        <div class="mb-4">
          <span class="text-xs uppercase tracking-widest text-gray-500 mb-2 block">Evidence:</span>
          <div class="grid grid-cols-3 sm:grid-cols-4 gap-3">
            ${r.evidence.map((url, idx) => `
              <div class="cursor-pointer overflow-hidden rounded-xl border border-gray-200 hover:border-blue-400 transition"
                   onclick="openPreview('${url}', ${/\.(jpg|jpeg|png|gif|webp)$/i.test(url)}, ${/\.(mp4|webm|mov)$/i.test(url)}, ${idx})">
                ${/\.(jpg|jpeg|png|gif|webp)$/i.test(url) ? 
                  `<img src="${url}" alt="Evidence" class="w-full h-24 object-cover">` :
                  /\.(mp4|webm|mov)$/i.test(url) ? 
                  `<video src="${url}" class="w-full h-24 object-cover" muted loop autoplay></video>` :
                  `<div class="w-full h-24 bg-gray-100 flex items-center justify-center text-xs text-gray-500">File</div>`}
              </div>
            `).join('')}
          </div>
        </div>` : ''}
        
        <button onclick="deleteReport('${r.id}')" 
          class="text-red-500 hover:text-red-700 text-sm font-medium flex items-center gap-1 mt-2">
          🗑️ Delete
        </button>
      </div>
    `;
  }).join('');
}

// Open full-size preview
function openPreview(url, isImage, isVideo) {
  const modal = document.getElementById('previewModal');
  const content = document.getElementById('modalContent');
  content.innerHTML = '';

  if (isImage) {
    content.innerHTML = `<img src="${url}" alt="Full evidence" class="max-w-[90%] max-h-[90vh]">`;
  } else if (isVideo) {
    content.innerHTML = `<video src="${url}" controls autoplay class="max-w-[90%] max-h-[90vh]"></video>`;
  } else {
    content.innerHTML = '<p class="text-white text-xl">Cannot preview this file type</p>';
  }

  modal.style.display = 'flex';
}

document.getElementById('closeModal').addEventListener('click', () => {
  document.getElementById('previewModal').style.display = 'none';
});

document.getElementById('previewModal').addEventListener('click', e => {
  if (e.target.id === 'previewModal') {
    document.getElementById('previewModal').style.display = 'none';
  }
});

// Submit new report + upload files
document.getElementById('reportForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const files = document.getElementById('evidence').files;
  const evidenceUrls = [];

  // Upload files one by one
  for (const file of files) {
    // Updated: allow up to 50 MB (Supabase free tier limit)
    if (file.size > 50 * 1024 * 1024) {
      alert(`File too large: ${file.name}\n\nMax allowed: 50 MB per file (current free plan limit).\nTry compressing the file or use a smaller one.`);
      continue;
    }

    const fileExt = file.name.split('.').pop();
    const filePath = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('evidence')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Upload failed:', error);
      alert(`Failed to upload ${file.name}: ${error.message}`);
      continue;
    }

    const { data: urlData } = supabase.storage
      .from('evidence')
      .getPublicUrl(filePath);

    evidenceUrls.push(urlData.publicUrl);
  }

  // Insert report record
  const { error } = await supabase
    .from('reports')
    .insert({
      username: formData.get('username').trim(),
      reason: formData.get('reason').trim(),
      details: formData.get('details').trim(),
      evidence: evidenceUrls.length ? evidenceUrls : null
    });

  if (error) {
    console.error('Insert failed:', error);
    alert('Failed to submit report. Check console for details.');
    return;
  }

  // Success
  document.getElementById('successMessage').classList.remove('hidden');
  e.target.reset();
  document.getElementById('previewContainer').innerHTML = '';

  await loadReports();

  setTimeout(() => {
    showView();
    document.getElementById('successMessage').classList.add('hidden');
  }, 1800);
});

// Delete report
window.deleteReport = async function(id) {
  if (!confirm('Delete this report?')) return;

  const { error } = await supabase
    .from('reports')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Delete failed:', error);
    alert('Could not delete report');
    return;
  }

  loadReports();
};

// Clear all – for testing
window.clearAllReports = async function() {
  if (!confirm('Delete ALL reports? This is irreversible.')) return;

  const { error } = await supabase
    .from('reports')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) console.error(error);
  loadReports();
};

// Tab switching
function showSubmit() {
  document.getElementById('submitSection').classList.remove('hidden');
  document.getElementById('viewSection').classList.add('hidden');
  document.getElementById('submitTab').classList.add('border-blue-600','text-blue-600');
  document.getElementById('submitTab').classList.remove('text-gray-500');
  document.getElementById('viewTab').classList.remove('border-blue-600','text-blue-600');
  document.getElementById('viewTab').classList.add('text-gray-500');
}

function showView() {
  document.getElementById('submitSection').classList.add('hidden');
  document.getElementById('viewSection').classList.remove('hidden');
  document.getElementById('submitTab').classList.remove('border-blue-600','text-blue-600');
  document.getElementById('submitTab').classList.add('text-gray-500');
  document.getElementById('viewTab').classList.add('border-blue-600','text-blue-600');
  renderReports(document.getElementById('searchInput').value);
}

// Local file preview (before upload)
document.getElementById('evidence').addEventListener('change', function() {
  const container = document.getElementById('previewContainer');
  container.innerHTML = '';

  Array.from(this.files).forEach(file => {
    const div = document.createElement('div');
    div.className = 'relative rounded-xl overflow-hidden border border-gray-200 shadow-sm w-full aspect-square';

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (isImage || isVideo) {
      const el = isImage ? document.createElement('img') : document.createElement('video');
      el.src = URL.createObjectURL(file);
      el.className = 'w-full h-full object-cover';
      if (isVideo) {
        el.muted = true;
        el.loop = true;
        el.autoplay = true;
      }
      div.appendChild(el);
    } else {
      div.innerHTML = `<div class="w-full h-full bg-gray-100 flex items-center justify-center text-xs p-2 text-center">${file.name}</div>`;
    }

    const name = document.createElement('div');
    name.className = 'absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 truncate text-center';
    name.textContent = file.name;
    div.appendChild(name);

    container.appendChild(div);
  });
});

// Search (client-side filter)
document.getElementById('searchInput').addEventListener('input', e => {
  renderReports(e.target.value);
});

// Realtime updates + initial load
window.onload = () => {
  loadReports();
  showSubmit();

  supabase
    .channel('public:reports')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => {
      loadReports();
    })
    .subscribe();
};