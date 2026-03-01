// script.js – CLEAN VERSION – ONLY ONE supabase declaration

const supabase = Supabase.createClient(
  'https://tnsjtjstvpzrgznbzjdc.supabase.co',
  'sb_publishable_c3HyWRydGbYHE9VkP_zRrQ_Ivi9U5fZ'
);

let reports = [];

async function loadReports() {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) {
    console.error('Load error:', error.message);
    document.getElementById('reportsList').innerHTML = '<p class="text-center text-red-600 py-12">Error loading reports</p>';
    return;
  }

  reports = data || [];
  renderReports();
}

function renderReports(filter = '') {
  const container = document.getElementById('reportsList');
  const lowerFilter = filter.toLowerCase();

  const filtered = reports.filter(r =>
    !lowerFilter ||
    (r.username || '').toLowerCase().includes(lowerFilter) ||
    (r.reason || '').toLowerCase().includes(lowerFilter) ||
    (r.details || '').toLowerCase().includes(lowerFilter)
  );

  container.innerHTML = filtered.length === 0 
    ? `<p class="text-center text-gray-500 py-12">No reports found</p>`
    : filtered.map(r => {
        const date = new Date(r.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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
                <span class="text-xs uppercase text-gray-500 mb-2 block">Evidence:</span>
                <div class="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  ${r.evidence.map((url, i) => `
                    <div class="cursor-pointer rounded-xl overflow-hidden border hover:border-blue-400 transition"
                         onclick="openPreview('${url}', $$   {/\.(jpg|jpeg|png|gif|webp)   $$/i.test(url)}, $$   {/\.(mp4|webm|mov)   $$/i.test(url)}, ${i})">
                      $$   {/\.(jpg|jpeg|png|gif|webp)   $$/i.test(url) ? 
                        `<img src="${url}" alt="Evidence" class="w-full h-24 object-cover">` :
                        /\.(mp4|webm|mov)$/i.test(url) ? 
                        `<video src="${url}" class="w-full h-24 object-cover" muted loop autoplay></video>` :
                        `<div class="w-full h-24 bg-gray-100 flex items-center justify-center text-xs text-gray-500">File</div>`}
                    </div>
                  `).join('')}
                </div>
              </div>` : ''}
            <button onclick="deleteReport('${r.id}')" class="text-red-500 hover:text-red-700 text-sm">
              🗑️ Delete
            </button>
          </div>
        `;
      }).join('');
}

function openPreview(url, isImage, isVideo) {
  const modal = document.getElementById('previewModal');
  const content = document.getElementById('modalContent');
  content.innerHTML = isImage 
    ? `<img src="${url}" alt="Full view" class="max-w-[90%] max-h-[90vh]">`
    : isVideo 
    ? `<video src="${url}" controls autoplay class="max-w-[90%] max-h-[90vh]"></video>`
    : '<p class="text-white text-xl">Cannot preview</p>';
  modal.style.display = 'flex';
}

document.getElementById('closeModal')?.addEventListener('click', () => {
  document.getElementById('previewModal').style.display = 'none';
});

document.getElementById('previewModal')?.addEventListener('click', e => {
  if (e.target.id === 'previewModal') document.getElementById('previewModal').style.display = 'none';
});

document.getElementById('reportForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  console.log('Submit clicked');

  const formData = new FormData(e.target);
  const files = document.getElementById('evidence').files;
  const evidenceUrls = [];

  for (const file of files) {
    if (file.size > 50 * 1024 * 1024) {
      alert(`File too large: ${file.name} (max 50 MB)`);
      continue;
    }

    const fileExt = file.name.split('.').pop();
    const filePath = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('evidence')
      .upload(filePath, file);

    if (uploadError) {
      console.error('Upload error:', uploadError);
      alert(`Upload failed: ${uploadError.message}`);
      continue;
    }

    const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(filePath);
    evidenceUrls.push(urlData.publicUrl);
  }

  const { error: insertError } = await supabase
    .from('reports')
    .insert({
      username: formData.get('username')?.trim() || 'Unknown',
      reason: formData.get('reason')?.trim() || 'Other',
      details: formData.get('details')?.trim() || '',
      evidence: evidenceUrls.length ? evidenceUrls : null
    });

  if (insertError) {
    console.error('Insert error:', insertError);
    alert('Submit failed:\n' + (insertError.message || 'Check console'));
    return;
  }

  console.log('Report sent');
  document.getElementById('successMessage').classList.remove('hidden');
  e.target.reset();
  document.getElementById('previewContainer').innerHTML = '';
  await loadReports();

  setTimeout(() => {
    showView();
    document.getElementById('successMessage').classList.add('hidden');
  }, 1500);
});

window.deleteReport = async function(id) {
  if (!confirm('Delete?')) return;
  await supabase.from('reports').delete().eq('id', id);
  loadReports();
};

window.clearAllReports = async function() {
  if (!confirm('Clear all?')) return;
  await supabase.from('reports').delete().neq('id', '0');
  loadReports();
};

function showSubmit() {
  document.getElementById('submitSection').classList.remove('hidden');
  document.getElementById('viewSection').classList.add('hidden');
  document.getElementById('submitTab').classList.add('border-blue-600', 'text-blue-600');
  document.getElementById('submitTab').classList.remove('text-gray-500');
  document.getElementById('viewTab').classList.remove('border-blue-600', 'text-blue-600');
  document.getElementById('viewTab').classList.add('text-gray-500');
}

function showView() {
  document.getElementById('submitSection').classList.add('hidden');
  document.getElementById('viewSection').classList.remove('hidden');
  document.getElementById('submitTab').classList.remove('border-blue-600', 'text-blue-600');
  document.getElementById('submitTab').classList.add('text-gray-500');
  document.getElementById('viewTab').classList.add('border-blue-600', 'text-blue-600');
  renderReports(document.getElementById('searchInput').value);
}

document.getElementById('evidence').addEventListener('change', function() {
  const container = document.getElementById('previewContainer');
  container.innerHTML = '';
  Array.from(this.files).forEach(file => {
    const div = document.createElement('div');
    div.className = 'relative rounded-xl overflow-hidden border w-full aspect-square';
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (isImage || isVideo) {
      const el = isImage ? document.createElement('img') : document.createElement('video');
      el.src = URL.createObjectURL(file);
      el.className = 'w-full h-full object-cover';
      if (isVideo) { el.muted = true; el.loop = true; el.autoplay = true; }
      div.appendChild(el);
    } else {
      div.innerHTML = `<div class="w-full h-full bg-gray-100 flex items-center justify-center text-xs p-2">${file.name}</div>`;
    }
    const name = document.createElement('div');
    name.className = 'absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 truncate text-center';
    name.textContent = file.name;
    div.appendChild(name);
    container.appendChild(div);
  });
});

document.getElementById('searchInput').addEventListener('input', e => renderReports(e.target.value));

window.onload = () => {
  console.log('Page loaded – connecting to Supabase');
  loadReports();
  showSubmit();
  supabase.channel('reports')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, loadReports)
    .subscribe();
};