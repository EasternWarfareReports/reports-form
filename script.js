let reports = [];

function initReports() {
  const saved = localStorage.getItem('kylitoReports');
  if (saved) {
    reports = JSON.parse(saved);
  } else {
    // Optional: keep samples or start empty
    reports = []; // ← change to [] if you want empty by default
    localStorage.setItem('kylitoReports', JSON.stringify(reports));
  }
  renderReports();
}

function renderReports(filter = '') {
  const container = document.getElementById('reportsList');
  const lowerFilter = filter.toLowerCase();

  const filtered = reports.filter(r =>
    !lowerFilter ||
    r.username.toLowerCase().includes(lowerFilter) ||
    r.reason.toLowerCase().includes(lowerFilter) ||
    r.details.toLowerCase().includes(lowerFilter)
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
            <span class="font-semibold text-lg">${r.username}</span>
            <span class="ml-3 text-xs px-3 py-1 rounded-full bg-gray-200 text-gray-700">${r.reason}</span>
          </div>
          <span class="text-xs text-gray-500">${date}</span>
        </div>
        
        <p class="text-gray-700 leading-relaxed mb-4">${r.details}</p>
        
        ${r.evidence.length ? `
        <div class="mb-4">
          <span class="text-xs uppercase tracking-widest text-gray-500 mb-2 block">Evidence:</span>
          <div class="grid grid-cols-3 sm:grid-cols-4 gap-3">
            ${r.evidence.map((file, idx) => {
              const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file);
              const isVideo = /\.(mp4|webm|mov)$/i.test(file);
              return `
                <div class="cursor-pointer overflow-hidden rounded-xl border border-gray-200 hover:border-blue-400 transition"
                     onclick="openPreview('${file}', ${isImage}, ${isVideo}, ${idx})">
                  ${isImage ? `<img src="${file}" alt="Evidence ${idx+1}" class="w-full h-24 object-cover">` :
                    isVideo ? `<video src="${file}" class="w-full h-24 object-cover" muted></video>` :
                    `<div class="w-full h-24 bg-gray-100 flex items-center justify-center text-xs text-gray-500">File</div>`}
                </div>
              `;
            }).join('')}
          </div>
        </div>` : ''}
        
        <button onclick="deleteReport('${r.id}')" 
          class="text-red-500 hover:text-red-700 text-sm font-medium flex items-center gap-1 mt-2">
          🗑️ Delete report
        </button>
      </div>
    `;
  }).join('');
}

// Note: In this demo, file previews use object URLs created on submit.
// Real file URLs would come from a backend storage service.

function openPreview(filename, isImage, isVideo, index) {
  const modal = document.getElementById('previewModal');
  const content = document.getElementById('modalContent');
  content.innerHTML = '';

  if (isImage) {
    const img = document.createElement('img');
    img.src = filename;
    img.alt = 'Full evidence image';
    content.appendChild(img);
  } else if (isVideo) {
    const video = document.createElement('video');
    video.src = filename;
    video.controls = true;
    video.autoplay = true;
    content.appendChild(video);
  } else {
    content.innerHTML = '<p class="text-white text-xl">File type not previewable in demo</p>';
  }

  modal.style.display = 'flex';
}

document.getElementById('closeModal')?.addEventListener('click', () => {
  document.getElementById('previewModal').style.display = 'none';
});

document.getElementById('previewModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('previewModal')) {
    document.getElementById('previewModal').style.display = 'none';
  }
});

window.deleteReport = function(id) {
  if (confirm('Delete this report?')) {
    reports = reports.filter(r => r.id !== id);
    localStorage.setItem('kylitoReports', JSON.stringify(reports));
    renderReports(document.getElementById('searchInput').value);
  }
};

window.clearAllReports = function() {
  if (confirm('Clear ALL reports? This cannot be undone.')) {
    reports = [];
    localStorage.setItem('kylitoReports', JSON.stringify(reports));
    renderReports(document.getElementById('searchInput').value);
  }
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

// Form submission
document.getElementById('reportForm').addEventListener('submit', function(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const files = document.getElementById('evidence').files;
  const evidencePreviews = [];

  // Create object URLs for preview (only works in current browser session)
  Array.from(files).forEach(file => {
    if (file.size > 15 * 1024 * 1024) {
      alert('File too large: ' + file.name);
      return;
    }
    evidencePreviews.push(URL.createObjectURL(file));
  });

  const newReport = {
    id: Date.now().toString(),
    username: formData.get('username'),
    reason: formData.get('reason').trim(),
    details: formData.get('details'),
    evidence: evidencePreviews,           // object URLs for this session
    originalNames: Array.from(files).map(f => f.name), // keep original names
    timestamp: new Date().toISOString()
  };

  reports.unshift(newReport);
  localStorage.setItem('kylitoReports', JSON.stringify(reports));

  document.getElementById('successMessage').classList.remove('hidden');
  e.target.reset();
  document.getElementById('previewContainer').innerHTML = '';

  setTimeout(() => {
    showView();
    document.getElementById('successMessage').classList.add('hidden');
  }, 1500);
});

// Live preview when selecting files
document.getElementById('evidence').addEventListener('change', function() {
  const container = document.getElementById('previewContainer');
  container.innerHTML = '';

  Array.from(this.files).forEach((file, idx) => {
    const div = document.createElement('div');
    div.className = 'relative rounded-xl overflow-hidden border border-gray-200 shadow-sm';

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (isImage) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.className = 'w-full h-24 object-cover';
      img.alt = file.name;
      div.appendChild(img);
    } else if (isVideo) {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.className = 'w-full h-24 object-cover';
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      div.appendChild(video);
    } else {
      div.innerHTML = `<div class="w-full h-24 bg-gray-100 flex items-center justify-center text-xs text-gray-500 p-2 text-center">${file.name}</div>`;
    }

    const nameTag = document.createElement('div');
    nameTag.className = 'absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 text-center truncate';
    nameTag.textContent = file.name;
    div.appendChild(nameTag);

    container.appendChild(div);
  });
});

// Search
document.getElementById('searchInput').addEventListener('input', (e) => {
  renderReports(e.target.value);
});

// Start
window.onload = function() {
  initReports();
  showSubmit();
};