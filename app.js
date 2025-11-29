// ╔════════════════════════════════════════════════════════════════╗
// ║   ★★★ 設定エリア - GAS URLはここを変更 ★★★                  ║
// ╚════════════════════════════════════════════════════════════════╝

const CONFIG = {
    GAS_URL: 'https://script.google.com/macros/s/AKfycbwVN9AoZsZZRhZsBac4sSdzhyO6Ns7KLi-X7UIsYmbWB8YLpQtwBmXs2DVz7quddWY9pA/exec'
};

// ╔════════════════════════════════════════════════════════════════╗
// ║   設定エリア終わり - 以下は編集不要                            ║
// ╚════════════════════════════════════════════════════════════════╝

// 状態管理
let videos = [];
let categories = [];
let currentFilter = 'All';
let currentUploadType = 'url';
let selectedFile = null;
let detectedPlatform = null;
let bookmarkData = {};
let bookmarkCategoryList = ['お気に入り'];
let searchQuery = '';
let bookmarkSearchQuery = '';
let currentBookmarkFilter = 'All';
let editingVideo = null;
let editingBookmarkCategory = null;
let currentModalVideoIndex = null;
let currentModalVideoId = null;
let generatedThumbnail = null;
let isSelectMode = false;
let selectedVideos = new Set();
let trashData = [];

// 無限スクロール用の設定
const ITEMS_PER_PAGE = 12;
let displayedCount = ITEMS_PER_PAGE;
let isLoadingMore = false;

// キャッシュ設定
const CACHE_KEY = 'sceneGalleryVideos';
const CACHE_TIME_KEY = 'sceneGalleryVideosTime';
const CACHE_DURATION = 5 * 60 * 1000;

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', () => {
    loadCategories();
    loadVideos();
    loadBookmarkData();
    loadTrashData();
    initDropArea();
    setupInfiniteScroll();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('modal').addEventListener('click', e => {
        if (e.target.id === 'modal') closeModal();
    });
    document.getElementById('upload-modal').addEventListener('click', e => {
        if (e.target.id === 'upload-modal') closeUploadModal();
    });
    document.getElementById('category-modal').addEventListener('click', e => {
        if (e.target.id === 'category-modal') closeCategoryModal();
    });
    document.getElementById('bookmarks-modal').addEventListener('click', e => {
        if (e.target.id === 'bookmarks-modal') closeBookmarksModal();
    });
    document.getElementById('bookmark-modal').addEventListener('click', e => {
        if (e.target.id === 'bookmark-modal') closeBookmarkModal();
    });
    document.getElementById('edit-modal').addEventListener('click', e => {
        if (e.target.id === 'edit-modal') closeEditModal();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (isSelectMode) {
                exitSelectMode();
            } else {
                closeModal();
                closeUploadModal();
                closeCategoryModal();
                closeBookmarksModal();
                closeBookmarkModal();
                closeAddBookmarkCategoryModal();
                closeEditModal();
                closeTrashModal();
            }
        }
    });
}

// ===== ローディング表示 =====
function showLoading(message = '処理中...') {
    document.getElementById('loading-message').textContent = message;
    document.getElementById('loading-overlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.remove('active');
}

// ===== ステータス更新 =====
function updateStatus(status, message) {
    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');
    indicator.className = 'status-indicator-mini ' + status;
    if (message === 'データの読み込みに失敗しました') {
        text.innerHTML = message + ' <span style="color: #ffc107; font-weight: 600;">※右上から更新してください</span>';
    } else {
        text.textContent = message;
    }
}

// ===== JSONP fetch =====
function fetchJsonp(url) {
    return new Promise((resolve, reject) => {
        const callbackName = 'jsonpCallback_' + Date.now();
        const script = document.createElement('script');
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('リクエストがタイムアウトしました'));
        }, 30000);
        window[callbackName] = (data) => {
            cleanup();
            resolve(data);
        };
        function cleanup() {
            clearTimeout(timeout);
            delete window[callbackName];
            if (script.parentNode) script.parentNode.removeChild(script);
        }
        script.onerror = () => {
            cleanup();
            reject(new Error('スクリプトの読み込みに失敗しました'));
        };
        script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + callbackName;
        document.body.appendChild(script);
    });
}

// ===== GASへのPOST送信 =====
async function postToGas(data) {
    try {
        await fetch(CONFIG.GAS_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(data)
        });
        return { success: true };
    } catch (error) {
        console.error('POST error:', error);
        return { success: false, error: error.message };
    }
}

// ===== カテゴリ =====
async function loadCategories() {
    try {
        const data = await fetchJsonp(CONFIG.GAS_URL + '?action=getCategories');
        if (data.error) throw new Error(data.error);
        categories = Array.isArray(data) ? data : [];
        updateCategorySelect();
        updateCategoryFilters();
    } catch (error) {
        console.error('Category load error:', error);
        categories = ['CM', 'WEB CM', 'MV'];
        updateCategorySelect();
        updateCategoryFilters();
    }
}

function updateCategoryFilters() {
    const filtersContainer = document.querySelector('.filters');
    filtersContainer.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.className = 'filter-btn' + (currentFilter === 'All' ? ' active' : '');
    allBtn.textContent = 'All';
    allBtn.onclick = () => filterVideos('All');
    filtersContainer.appendChild(allBtn);
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn' + (currentFilter === cat ? ' active' : '');
        btn.textContent = cat;
        btn.onclick = () => filterVideos(cat);
        filtersContainer.appendChild(btn);
    });
}

function updateCategorySelect() {
    const select = document.getElementById('video-category');
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = '<option value="">選択してください</option>';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
    });
    if (currentValue && categories.includes(currentValue)) {
        select.value = currentValue;
    }
}

function filterVideos(category) {
    currentFilter = category;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent === category);
    });
    const bookmarkLink = document.getElementById('bookmark-link');
    if (bookmarkLink) {
        bookmarkLink.classList.toggle('active', category === 'Bookmarks');
    }
    renderGallery();
}

// ===== 動画読み込み =====
async function loadVideos(forceRefresh = false) {
    updateStatus('loading', 'データを読み込み中...');
    if (!forceRefresh) {
        const cached = localStorage.getItem(CACHE_KEY);
        const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
        if (cached && cachedTime) {
            const age = Date.now() - parseInt(cachedTime);
            if (age < CACHE_DURATION) {
                try {
                    videos = JSON.parse(cached);
                    updateStatus('success', `${videos.length}件の動画を読み込みました（キャッシュ）`);
                    renderGallery();
                    refreshInBackground();
                    return;
                } catch (e) {
                    console.error('Cache parse error:', e);
                }
            }
        }
    }
    showLoading('動画データを読み込み中...');
    try {
        const data = await fetchJsonp(CONFIG.GAS_URL);
        if (data.error) throw new Error(data.error);
        videos = Array.isArray(data) ? data : [];
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(videos));
            localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
        } catch (e) {
            console.warn('Cache save error:', e);
        }
        hideLoading();
        updateStatus('success', `${videos.length}件の動画を読み込みました`);
        renderGallery();
    } catch (error) {
        hideLoading();
        console.error('Load error:', error);
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            try {
                videos = JSON.parse(cached);
                updateStatus('error', 'オフラインデータを表示中');
                renderGallery();
                return;
            } catch (e) {}
        }
        updateStatus('error', 'データの読み込みに失敗しました');
        document.getElementById('gallery').innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                <p>データの読み込みに失敗しました</p>
            </div>
        `;
    }
}

async function refreshInBackground() {
    try {
        const data = await fetchJsonp(CONFIG.GAS_URL);
        if (data.error) return;
        const newVideos = Array.isArray(data) ? data : [];
        if (JSON.stringify(newVideos) !== JSON.stringify(videos)) {
            videos = newVideos;
            localStorage.setItem(CACHE_KEY, JSON.stringify(videos));
            localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
            updateStatus('success', `${videos.length}件の動画を読み込みました`);
            renderGallery();
        }
    } catch (e) {
        console.warn('Background refresh failed:', e);
    }
}

// ===== ギャラリー描画 =====
function getFilteredVideos() {
    let filtered = videos;
    if (currentFilter === 'Bookmarks') {
        filtered = videos.filter(v => isBookmarked(v.id));
    } else if (currentFilter !== 'All') {
        filtered = videos.filter(v => v.category === currentFilter);
    }
    if (searchQuery) {
        filtered = filtered.filter(v => 
            (v.title && v.title.toLowerCase().includes(searchQuery)) ||
            (v.description && v.description.toLowerCase().includes(searchQuery))
        );
    }
    return filtered;
}

function renderGallery(reset = true) {
    const gallery = document.getElementById('gallery');
    const filteredVideos = getFilteredVideos();
    if (reset) displayedCount = ITEMS_PER_PAGE;
    updateBookmarkCount();
    if (filteredVideos.length === 0) {
        let emptyMessage = '動画がありません';
        let emptyIcon = 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z';
        if (currentFilter === 'Bookmarks') {
            emptyMessage = 'ブックマークした動画がありません';
            emptyIcon = 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z';
        } else if (searchQuery) {
            emptyMessage = `「${searchQuery}」に一致する動画がありません`;
            emptyIcon = 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z';
        }
        gallery.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24"><path d="${emptyIcon}"/></svg>
                <p>${emptyMessage}</p>
            </div>
        `;
        return;
    }
    const videosToShow = filteredVideos.slice(0, displayedCount);
    const hasMore = displayedCount < filteredVideos.length;
    gallery.innerHTML = videosToShow.map((video, index) => {
        const thumbnail = video.thumbnail || getDefaultThumbnail(video);
        const source = video.source || 'unknown';
        const sourceLabel = { youtube: 'YouTube', vimeo: 'Vimeo', instagram: 'Instagram', dropbox: 'Dropbox', unknown: 'Other' }[source] || source;
        const videoId = video.id || index;
        const bookmarked = isBookmarked(videoId);
        const isSelected = selectedVideos.has(video.id);
        const canDownload = source === 'dropbox';
        return `
            <article class="video-card ${isSelected ? 'selected' : ''}" data-index="${index}" data-id="${video.id}" onclick="handleCardClick(${index}, event)">
                <div class="thumbnail-wrapper">
                    <img class="thumbnail" src="${thumbnail}" alt="${video.title}" loading="lazy" 
                        onerror="this.src='https://via.placeholder.com/640x360/1a1a1a/333?text=No+Thumbnail'">
                    <div class="play-overlay">
                        <div class="play-btn">
                            <svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>
                        </div>
                    </div>
                    <span class="source-badge ${source}">${sourceLabel}</span>
                </div>
                <div class="card-content">
                    <div class="card-meta">
                        <span class="category">${video.category || 'Uncategorized'}</span>
                        <span class="date">${video.date || ''}</span>
                    </div>
                    <h3 class="card-title">${video.title || 'Untitled'}</h3>
                    <div class="card-actions" onclick="event.stopPropagation()">
                        <button class="action-btn bookmark-btn ${bookmarked ? 'active' : ''}" onclick="toggleBookmark(${index}, event)" title="ブックマーク">
                            <svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
                        </button>
                        <button class="action-btn edit-btn" onclick="openEditModal(${index}, event)" title="編集">
                            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                        </button>
                        <button class="action-btn download-btn ${canDownload ? '' : 'disabled'}" onclick="${canDownload ? `downloadVideo(${index}, event)` : 'event.stopPropagation()'}" title="${canDownload ? 'ダウンロード' : 'この動画はダウンロードできません'}" ${canDownload ? '' : 'disabled'}>
                            <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                        </button>
                        <button class="action-btn delete-btn" onclick="deleteVideo(${index}, event)" title="削除">
                            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join('');
    if (hasMore) {
        gallery.innerHTML += `
            <div class="load-more-container" id="load-more-trigger">
                <button class="load-more-btn" onclick="loadMoreVideos()">
                    もっと見る（残り ${filteredVideos.length - displayedCount} 件）
                </button>
            </div>
        `;
    }
}

function loadMoreVideos() {
    if (isLoadingMore) return;
    isLoadingMore = true;
    displayedCount += ITEMS_PER_PAGE;
    renderGallery(false);
    isLoadingMore = false;
}

function setupInfiniteScroll() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !isLoadingMore) loadMoreVideos();
        });
    }, { rootMargin: '200px' });
    const galleryObserver = new MutationObserver(() => {
        const trigger = document.getElementById('load-more-trigger');
        if (trigger) observer.observe(trigger);
    });
    galleryObserver.observe(document.getElementById('gallery'), { childList: true });
}

function getDefaultThumbnail(video) {
    if (video.videoUrl?.includes('youtube.com') || video.videoUrl?.includes('youtu.be')) {
        const videoId = extractYoutubeId(video.videoUrl);
        if (videoId) return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    }
    return 'https://via.placeholder.com/640x360/1a1a1a/333?text=Video';
}

// ===== 検索 =====
function searchVideos() {
    const input = document.getElementById('search-input');
    const clearBtn = document.getElementById('search-clear');
    searchQuery = input.value.trim().toLowerCase();
    clearBtn.style.display = searchQuery ? 'block' : 'none';
    renderGallery();
}

function clearSearch() {
    document.getElementById('search-input').value = '';
    document.getElementById('search-clear').style.display = 'none';
    searchQuery = '';
    renderGallery();
}

// ===== ブックマーク =====
async function loadBookmarkData() {
    try {
        const categories = await fetchJsonp(CONFIG.GAS_URL + '?action=getBookmarkCategories');
        if (Array.isArray(categories) && categories.length > 0) {
            bookmarkCategoryList = categories.filter(cat => typeof cat === 'string' && cat.trim() !== '');
        }
        const bookmarks = await fetchJsonp(CONFIG.GAS_URL + '?action=getBookmarks');
        if (bookmarks && !bookmarks.error && typeof bookmarks === 'object') {
            bookmarkData = {};
            Object.keys(bookmarks).forEach(categoryName => {
                if (typeof categoryName !== 'string' || categoryName.trim() === '' || categoryName === '[object Object]') return;
                const videoList = bookmarks[categoryName];
                if (!Array.isArray(videoList)) return;
                videoList.forEach(video => {
                    if (!video || typeof video !== 'object') return;
                    const videoId = video.id;
                    if (videoId === undefined || videoId === null || videoId === '' || typeof videoId === 'object' || String(videoId) === '[object Object]') return;
                    if (!bookmarkData[videoId]) {
                        bookmarkData[videoId] = { category: video.originalCategory || '', bookmarkCategories: [], videoData: video };
                    }
                    if (!bookmarkData[videoId].bookmarkCategories.includes(categoryName)) {
                        bookmarkData[videoId].bookmarkCategories.push(categoryName);
                    }
                });
            });
        }
        updateBookmarkCount();
    } catch (error) {
        console.error('Bookmark load error:', error);
    }
}

function isBookmarked(videoId) {
    if (videoId === undefined || videoId === null || String(videoId) === '[object Object]') return false;
    return bookmarkData[videoId] && bookmarkData[videoId].bookmarkCategories && bookmarkData[videoId].bookmarkCategories.length > 0;
}

function getBookmarkedIds() {
    return Object.keys(bookmarkData).filter(id => {
        if (id === '' || id === 'undefined' || id === 'null' || id === '[object Object]') return false;
        return isBookmarked(id);
    }).map(id => {
        const num = parseInt(id);
        return isNaN(num) ? id : num;
    });
}

function updateBookmarkCount() {
    const countEl = document.getElementById('bookmark-count');
    if (countEl) countEl.textContent = getBookmarkedIds().length;
}

function toggleBookmark(index, event) {
    event.stopPropagation();
    const filteredVideos = getFilteredVideos();
    const video = filteredVideos[index];
    openBookmarkModal(video, index);
}

function openBookmarkModal(video, index) {
    const modal = document.getElementById('bookmark-modal');
    const checkboxContainer = document.getElementById('bookmark-category-checkboxes');
    const videoId = video.id || index;
    const currentCategories = bookmarkData[videoId]?.bookmarkCategories || [];
    checkboxContainer.innerHTML = bookmarkCategoryList.map(cat => `
        <label class="bookmark-checkbox-label">
            <input type="checkbox" value="${cat}" ${currentCategories.includes(cat) ? 'checked' : ''}>
            <span>${cat}</span>
        </label>
    `).join('');
    modal.dataset.videoId = videoId;
    modal.dataset.videoCategory = video.category || 'Uncategorized';
    modal.dataset.videoTitle = video.title || 'Untitled';
    document.getElementById('bookmark-video-title').textContent = video.title || 'Untitled';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeBookmarkModal() {
    document.getElementById('bookmark-modal').classList.remove('active');
    document.body.style.overflow = '';
}

async function saveBookmark() {
    const modal = document.getElementById('bookmark-modal');
    const videoId = parseInt(modal.dataset.videoId);
    const videoCategory = modal.dataset.videoCategory;
    const video = videos.find(v => v.id === videoId);
    if (!video) { alert('動画が見つかりません'); return; }
    const checkboxes = document.querySelectorAll('#bookmark-category-checkboxes input[type="checkbox"]:checked');
    const selectedCategories = Array.from(checkboxes).map(cb => cb.value);
    const currentCategories = bookmarkData[videoId]?.bookmarkCategories || [];
    showLoading('ブックマークを保存中...');
    try {
        const addedCategories = selectedCategories.filter(cat => !currentCategories.includes(cat));
        const removedCategories = currentCategories.filter(cat => !selectedCategories.includes(cat));
        for (const cat of addedCategories) {
            await postToGas({
                action: 'addBookmark', bookmarkCategory: cat,
                video: { id: video.id, title: video.title, description: video.description, date: video.date, thumbnail: video.thumbnail, videoUrl: video.videoUrl, source: video.source, category: video.category }
            });
        }
        for (const cat of removedCategories) {
            await postToGas({ action: 'removeBookmark', bookmarkCategory: cat, videoId: videoId });
        }
        if (selectedCategories.length === 0) {
            delete bookmarkData[videoId];
        } else {
            bookmarkData[videoId] = { category: videoCategory, bookmarkCategories: selectedCategories, videoData: video };
        }
        hideLoading();
        closeBookmarkModal();
        updateBookmarkCount();
        renderGallery();
        updateStatus('', 'ブックマークを保存しました');
    } catch (error) {
        hideLoading();
        console.error('Bookmark save error:', error);
        alert('ブックマークの保存に失敗しました');
    }
}

function showAddBookmarkCategoryModal() {
    document.getElementById('add-bookmark-category-modal').classList.add('active');
}

function closeAddBookmarkCategoryModal() {
    document.getElementById('add-bookmark-category-modal').classList.remove('active');
    document.getElementById('new-bookmark-category-name').value = '';
}

async function addBookmarkCategory() {
    const name = document.getElementById('new-bookmark-category-name').value.trim();
    if (!name) { alert('カテゴリ名を入力してください'); return; }
    if (bookmarkCategoryList.includes(name)) { alert('このカテゴリは既に存在します'); return; }
    showLoading('カテゴリを追加中...');
    try {
        await postToGas({ action: 'addBookmarkCategory', name: name });
        bookmarkCategoryList.push(name);
        const checkboxContainer = document.getElementById('bookmark-category-checkboxes');
        const currentChecked = Array.from(checkboxContainer.querySelectorAll('input:checked')).map(cb => cb.value);
        currentChecked.push(name);
        checkboxContainer.innerHTML = bookmarkCategoryList.map(cat => `
            <label class="bookmark-checkbox-label">
                <input type="checkbox" value="${cat}" ${currentChecked.includes(cat) ? 'checked' : ''}>
                <span>${cat}</span>
            </label>
        `).join('');
        hideLoading();
        closeAddBookmarkCategoryModal();
    } catch (error) {
        hideLoading();
        console.error('Add category error:', error);
        alert('カテゴリの追加に失敗しました');
    }
}

function openEditBookmarkCategoryModal(categoryName) {
    editingBookmarkCategory = categoryName;
    document.getElementById('edit-bookmark-category-name').value = categoryName;
    document.getElementById('edit-bookmark-category-modal').classList.add('active');
}

function closeEditBookmarkCategoryModal() {
    document.getElementById('edit-bookmark-category-modal').classList.remove('active');
    editingBookmarkCategory = null;
}

async function saveBookmarkCategoryName() {
    const newName = document.getElementById('edit-bookmark-category-name').value.trim();
    if (!newName) { alert('カテゴリ名を入力してください'); return; }
    if (newName === editingBookmarkCategory) { closeEditBookmarkCategoryModal(); return; }
    if (bookmarkCategoryList.includes(newName)) { alert('このカテゴリ名は既に存在します'); return; }
    showLoading('カテゴリ名を変更中...');
    try {
        await postToGas({ action: 'renameBookmarkCategory', oldName: editingBookmarkCategory, newName: newName });
        const index = bookmarkCategoryList.indexOf(editingBookmarkCategory);
        if (index !== -1) bookmarkCategoryList[index] = newName;
        Object.keys(bookmarkData).forEach(videoId => {
            const cats = bookmarkData[videoId].bookmarkCategories;
            const catIndex = cats.indexOf(editingBookmarkCategory);
            if (catIndex !== -1) cats[catIndex] = newName;
        });
        if (currentBookmarkFilter === editingBookmarkCategory) currentBookmarkFilter = newName;
        hideLoading();
        closeEditBookmarkCategoryModal();
        renderBookmarksCategoryButtons();
        updateStatus('', 'カテゴリ名を変更しました');
    } catch (error) {
        hideLoading();
        console.error('Rename category error:', error);
        alert('カテゴリ名の変更に失敗しました');
    }
}

async function deleteBookmarkCategory() {
    const categoryName = editingBookmarkCategory;
    if (!confirm(`「${categoryName}」カテゴリを削除しますか？\nこのカテゴリのブックマークも全て削除されます。`)) return;
    showLoading('カテゴリを削除中...');
    try {
        await postToGas({ action: 'deleteBookmarkCategory', name: categoryName });
        const index = bookmarkCategoryList.indexOf(categoryName);
        if (index !== -1) bookmarkCategoryList.splice(index, 1);
        Object.keys(bookmarkData).forEach(videoId => {
            const cats = bookmarkData[videoId].bookmarkCategories;
            const catIndex = cats.indexOf(categoryName);
            if (catIndex !== -1) cats.splice(catIndex, 1);
            if (cats.length === 0) delete bookmarkData[videoId];
        });
        currentBookmarkFilter = 'All';
        hideLoading();
        closeEditBookmarkCategoryModal();
        renderBookmarksCategoryButtons();
        renderBookmarksGrid();
        updateBookmarkCount();
        renderGallery();
        updateStatus('', 'カテゴリを削除しました');
    } catch (error) {
        hideLoading();
        console.error('Delete category error:', error);
        alert('カテゴリの削除に失敗しました');
    }
}

// ===== ブックマーク一覧モーダル =====
function openBookmarksModal() {
    document.getElementById('bookmarks-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
    currentBookmarkFilter = 'All';
    bookmarkSearchQuery = '';
    document.getElementById('bookmarks-search-input').value = '';
    renderBookmarksCategoryButtons();
    renderBookmarksGrid();
}

function closeBookmarksModal() {
    document.getElementById('bookmarks-modal').classList.remove('active');
    document.body.style.overflow = '';
}

function renderBookmarksCategoryButtons() {
    const container = document.getElementById('bookmarks-categories');
    const bookmarkedIds = getBookmarkedIds();
    const categoryCounts = { All: bookmarkedIds.length };
    bookmarkedIds.forEach(id => {
        const data = bookmarkData[id];
        const cats = data?.bookmarkCategories || ['お気に入り'];
        cats.forEach(cat => { categoryCounts[cat] = (categoryCounts[cat] || 0) + 1; });
    });
    const cats = ['All', ...bookmarkCategoryList];
    let html = cats.map(cat => {
        const count = categoryCounts[cat] || 0;
        const isAll = cat === 'All';
        return `
            <div class="bookmark-cat-wrapper ${currentBookmarkFilter === cat ? 'active' : ''}">
                <button class="bookmark-cat-btn ${currentBookmarkFilter === cat ? 'active' : ''}" onclick="filterBookmarksCategory('${cat}')">
                    ${cat}<span class="cat-count">(${count})</span>
                </button>
                ${!isAll ? `<button class="bookmark-cat-edit-btn" onclick="openEditBookmarkCategoryModal('${cat}')" title="編集"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>` : ''}
            </div>
        `;
    }).join('');
    html += `<button class="add-bookmark-cat-btn" onclick="showAddBookmarkCategoryFromModal()"><svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>追加</button>`;
    container.innerHTML = html;
}

function filterBookmarksCategory(category) {
    currentBookmarkFilter = category;
    renderBookmarksCategoryButtons();
    renderBookmarksGrid();
}

function filterBookmarksModal() {
    bookmarkSearchQuery = document.getElementById('bookmarks-search-input').value.trim().toLowerCase();
    renderBookmarksGrid();
}

function getFilteredBookmarks() {
    let bookmarkedVideos = videos.filter(v => isBookmarked(v.id));
    if (currentBookmarkFilter !== 'All') {
        bookmarkedVideos = bookmarkedVideos.filter(v => {
            const data = bookmarkData[v.id];
            const cats = data?.bookmarkCategories || ['お気に入り'];
            return cats.includes(currentBookmarkFilter);
        });
    }
    if (bookmarkSearchQuery) {
        bookmarkedVideos = bookmarkedVideos.filter(v => 
            (v.title && v.title.toLowerCase().includes(bookmarkSearchQuery)) ||
            (v.description && v.description.toLowerCase().includes(bookmarkSearchQuery))
        );
    }
    return bookmarkedVideos;
}

function renderBookmarksGrid() {
    const grid = document.getElementById('bookmarks-grid');
    const filteredBookmarks = getFilteredBookmarks();
    if (filteredBookmarks.length === 0) {
        let message = 'ブックマークがありません';
        if (bookmarkSearchQuery) message = `「${bookmarkSearchQuery}」に一致する動画がありません`;
        else if (currentBookmarkFilter !== 'All') message = `「${currentBookmarkFilter}」カテゴリにブックマークがありません`;
        grid.innerHTML = `<div class="bookmarks-empty"><svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg><p>${message}</p></div>`;
        return;
    }
    grid.innerHTML = filteredBookmarks.map((video) => {
        const thumbnail = video.thumbnail || getDefaultThumbnail(video);
        const bookmarkCats = bookmarkData[video.id]?.bookmarkCategories || ['お気に入り'];
        const catDisplay = bookmarkCats.length > 1 ? `${bookmarkCats[0]} +${bookmarkCats.length - 1}` : bookmarkCats[0];
        return `
            <div class="bookmark-card" onclick="playBookmarkVideo(${video.id})">
                <div class="bookmark-card-thumb">
                    <img src="${thumbnail}" alt="${video.title}" onerror="this.src='https://via.placeholder.com/320x180/1a1a1a/333?text=No+Thumbnail'">
                    <span class="bookmark-card-cat" title="${bookmarkCats.join(', ')}">${catDisplay}</span>
                </div>
                <div class="bookmark-card-info">
                    <h4 class="bookmark-card-title">${video.title || 'Untitled'}</h4>
                    <div class="bookmark-card-actions">
                        <button onclick="editBookmarkFromModal(${video.id}, event)" title="カテゴリ編集"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
                        <button class="remove" onclick="removeFromBookmarks(${video.id}, event)" title="ブックマーク解除"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function playBookmarkVideo(videoId) {
    const video = videos.find(v => v.id === videoId);
    if (!video) return;
    closeBookmarksModal();
    const index = videos.indexOf(video);
    openModal(index);
}

function removeFromBookmarks(videoId, event) {
    event.stopPropagation();
    delete bookmarkData[videoId];
    localStorage.setItem('videoBookmarkData', JSON.stringify(bookmarkData));
    updateBookmarkCount();
    renderBookmarksCategoryButtons();
    renderBookmarksGrid();
    renderGallery();
}

function editBookmarkFromModal(videoId, event) {
    event.stopPropagation();
    const video = videos.find(v => v.id === videoId);
    if (!video) return;
    closeBookmarksModal();
    openBookmarkModal(video, videoId);
}

function showAddBookmarkCategoryFromModal() {
    const name = prompt('新しいブックマークカテゴリ名を入力:');
    if (!name || !name.trim()) return;
    if (bookmarkCategoryList.includes(name.trim())) { alert('このカテゴリは既に存在します'); return; }
    bookmarkCategoryList.push(name.trim());
    localStorage.setItem('bookmarkCategories', JSON.stringify(bookmarkCategoryList));
    renderBookmarksCategoryButtons();
}

// ===== 動画モーダル =====
function getPlayableUrl(url, source) {
    if (!url) return url;
    if (source === 'dropbox' || url.includes('dropbox.com')) {
        return url.replace('&dl=0', '&raw=1').replace('?dl=0', '?raw=1');
    }
    return url;
}

function openModal(index) {
    const filteredVideos = getFilteredVideos();
    const video = filteredVideos[index];
    if (!video) return;
    currentModalVideoIndex = index;
    currentModalVideoId = video.id;
    const container = document.getElementById('modal-video-container');
    const source = video.source || (video.videoUrl?.includes('youtube') ? 'youtube' : 'dropbox');
    const playableUrl = getPlayableUrl(video.videoUrl, source);
    const downloadBtn = document.querySelector('.modal-action-btn.download-btn');
    const canDownload = source === 'dropbox';
    if (downloadBtn) {
        downloadBtn.disabled = !canDownload;
        downloadBtn.classList.toggle('disabled', !canDownload);
        downloadBtn.title = canDownload ? 'ダウンロード' : 'この動画はダウンロードできません';
    }
    if ((source === 'youtube' || source === 'vimeo') && video.videoUrl) {
        container.innerHTML = `<iframe src="${video.videoUrl}" frameborder="0" allowfullscreen></iframe>`;
    } else if (source === 'instagram' && video.videoUrl) {
        container.innerHTML = `<iframe src="${video.videoUrl}" frameborder="0" scrolling="no"></iframe>`;
    } else if (playableUrl) {
        container.innerHTML = `<video src="${playableUrl}" controls></video>`;
    } else {
        const thumb = video.thumbnail || 'https://via.placeholder.com/640x360/1a1a1a/333?text=No+Video';
        container.innerHTML = `<img src="${thumb}" alt="${video.title}">`;
    }
    const sourceLabels = { youtube: 'YouTube', vimeo: 'Vimeo', instagram: 'Instagram', dropbox: 'Dropbox' };
    document.getElementById('modal-title').textContent = video.title || 'Untitled';
    document.getElementById('modal-category').textContent = video.category || 'Uncategorized';
    document.getElementById('modal-date').textContent = video.date || '';
    document.getElementById('modal-source').textContent = sourceLabels[source] || source;
    document.getElementById('modal-description').textContent = video.description || '';
    const bookmarkBtn = document.getElementById('modal-bookmark-btn');
    const videoId = video.id || index;
    if (isBookmarked(videoId)) {
        bookmarkBtn.classList.add('active');
        bookmarkBtn.querySelector('span').textContent = 'ブックマーク済み';
    } else {
        bookmarkBtn.classList.remove('active');
        bookmarkBtn.querySelector('span').textContent = 'ブックマーク';
    }
    document.getElementById('modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
    document.body.style.overflow = '';
    document.getElementById('modal-video-container').innerHTML = '';
    currentModalVideoIndex = null;
}

function handleCardClick(index, event) {
    if (isSelectMode) toggleVideoSelection(index, event);
    else openModal(index);
}

function toggleBookmarkFromModal() {
    if (currentModalVideoIndex === null) return;
    const filteredVideos = getFilteredVideos();
    const video = filteredVideos[currentModalVideoIndex];
    if (!video) return;
    closeModal();
    openBookmarkModal(video, currentModalVideoIndex);
}

function openEditFromModal() {
    if (currentModalVideoId === null) return;
    const video = videos.find(v => v.id === currentModalVideoId);
    if (!video) return;
    closeModal();
    editingVideo = video;
    document.getElementById('edit-video-title').textContent = video.title || 'Untitled';
    document.getElementById('edit-title-input').value = video.title || '';
    document.getElementById('edit-features-input').value = video.description || '';
    const categorySelect = document.getElementById('edit-category-select');
    categorySelect.innerHTML = categories.map(cat => `<option value="${cat}" ${video.category === cat ? 'selected' : ''}>${cat}</option>`).join('');
    document.getElementById('edit-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

async function downloadFromModal() {
    if (currentModalVideoId === null) return;
    const video = videos.find(v => v.id === currentModalVideoId);
    if (!video) return;
    const source = video.source || 'unknown';
    if (source !== 'dropbox') { alert('この動画はダウンロードできません'); return; }
    if (!video.videoUrl) { alert('動画URLが見つかりません'); return; }
    showLoading('ダウンロード準備中...');
    try {
        const filename = (video.title || 'video') + '.mp4';
        const url = `${CONFIG.GAS_URL}?action=downloadFile&url=${encodeURIComponent(video.videoUrl)}&filename=${encodeURIComponent(filename)}`;
        const response = await fetch(url);
        const result = await response.json();
        if (result.error) throw new Error(result.error);
        const byteCharacters = atob(result.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: result.contentType });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = result.filename || filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Download error:', error);
        alert('ダウンロードに失敗しました: ' + error.message);
    }
}

async function deleteFromModal() {
    if (currentModalVideoId === null) return;
    const video = videos.find(v => v.id === currentModalVideoId);
    if (!video) return;
    if (!confirm(`「${video.title}」をゴミ箱に移動しますか？`)) return;
    closeModal();
    showLoading('ゴミ箱に移動中...');
    try {
        await postToGas({ action: 'deleteVideo', id: video.id, category: video.category });
        hideLoading();
        moveToTrash(video);
        videos = videos.filter(v => v.id !== video.id);
        renderGallery();
        updateBookmarkCount();
        updateStatus('', 'ゴミ箱に移動しました');
    } catch (error) {
        hideLoading();
        console.error('Delete error:', error);
        moveToTrash(video);
        videos = videos.filter(v => v.id !== video.id);
        renderGallery();
        updateBookmarkCount();
        updateStatus('', 'ゴミ箱に移動しました');
    }
}

// ===== 編集モーダル =====
function openEditModal(index, event) {
    event.stopPropagation();
    const filteredVideos = getFilteredVideos();
    const video = filteredVideos[index];
    editingVideo = video;
    document.getElementById('edit-video-title').textContent = video.title || 'Untitled';
    document.getElementById('edit-title-input').value = video.title || '';
    document.getElementById('edit-features-input').value = video.description || '';
    const categorySelect = document.getElementById('edit-category-select');
    categorySelect.innerHTML = categories.map(cat => `<option value="${cat}" ${video.category === cat ? 'selected' : ''}>${cat}</option>`).join('');
    document.getElementById('edit-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('active');
    document.body.style.overflow = '';
    editingVideo = null;
}

async function saveVideoEdit() {
    if (!editingVideo) return;
    const newTitle = document.getElementById('edit-title-input').value.trim();
    const newFeatures = document.getElementById('edit-features-input').value.trim();
    const newCategory = document.getElementById('edit-category-select').value;
    if (!newTitle) { alert('タイトルを入力してください'); return; }
    showLoading('保存中...');
    try {
        const result = await postToGas({ action: 'updateVideo', id: editingVideo.id, oldCategory: editingVideo.category, newCategory: newCategory, title: newTitle, description: newFeatures });
        hideLoading();
        if (result.success) {
            const videoIndex = videos.findIndex(v => v.id === editingVideo.id);
            if (videoIndex !== -1) {
                videos[videoIndex].title = newTitle;
                videos[videoIndex].description = newFeatures;
                videos[videoIndex].category = newCategory;
            }
            closeEditModal();
            renderGallery();
            updateStatus('', '更新完了');
        } else {
            alert('更新に失敗しました: ' + (result.error || '不明なエラー'));
        }
    } catch (error) {
        hideLoading();
        console.error('Update error:', error);
        alert('更新に失敗しました: ' + error.message);
    }
}

// ===== 動画削除・ダウンロード =====
async function downloadVideo(index, event) {
    event.stopPropagation();
    const filteredVideos = getFilteredVideos();
    const video = filteredVideos[index];
    if (video.source === 'dropbox' && video.videoUrl) {
        showLoading('ダウンロード準備中...');
        try {
            const filename = (video.title || 'video') + '.mp4';
            const url = `${CONFIG.GAS_URL}?action=downloadFile&url=${encodeURIComponent(video.videoUrl)}&filename=${encodeURIComponent(filename)}`;
            const response = await fetch(url);
            const result = await response.json();
            if (result.error) throw new Error(result.error);
            const byteCharacters = atob(result.data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: result.contentType });
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = result.filename || filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);
            hideLoading();
        } catch (error) {
            hideLoading();
            console.error('Download error:', error);
            alert('ダウンロードに失敗しました: ' + error.message);
        }
    } else if (video.source === 'youtube') {
        alert('YouTube動画は直接ダウンロードできません。\nYouTubeのサイトでご確認ください。');
    } else if (video.source === 'vimeo') {
        alert('Vimeo動画は直接ダウンロードできません。\nVimeoのサイトでご確認ください。');
    } else if (video.source === 'instagram') {
        alert('Instagram動画は直接ダウンロードできません。\nInstagramのサイトでご確認ください。');
    } else {
        alert('この動画はダウンロードできません。');
    }
}

async function deleteVideo(index, event) {
    event.stopPropagation();
    const filteredVideos = getFilteredVideos();
    const video = filteredVideos[index];
    if (!confirm(`「${video.title}」をゴミ箱に移動しますか？`)) return;
    showLoading('ゴミ箱に移動中...');
    try {
        await postToGas({ action: 'deleteVideo', id: video.id, category: video.category });
        hideLoading();
        moveToTrash(video);
        videos = videos.filter(v => v.id !== video.id);
        renderGallery();
        updateBookmarkCount();
        updateStatus('', 'ゴミ箱に移動しました');
    } catch (error) {
        hideLoading();
        console.error('Delete error:', error);
        moveToTrash(video);
        videos = videos.filter(v => v.id !== video.id);
        renderGallery();
        updateBookmarkCount();
        updateStatus('', 'ゴミ箱に移動しました');
    }
}

// ===== アップロード =====
function showUploadModal() {
    document.getElementById('upload-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeUploadModal() {
    document.getElementById('upload-modal').classList.remove('active');
    document.body.style.overflow = '';
    resetUploadForm();
}

function selectUploadType(type) {
    currentUploadType = type;
    document.querySelectorAll('.upload-type-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.${type}-type`).classList.add('active');
    document.getElementById('url-input').style.display = type === 'url' ? 'block' : 'none';
    document.getElementById('file-input').style.display = type === 'dropbox' ? 'block' : 'none';
    document.getElementById('thumbnail-url-group').style.display = type === 'dropbox' ? 'block' : 'none';
}

function extractYoutubeId(url) {
    if (!url) return null;
    const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/, /^([a-zA-Z0-9_-]{11})$/];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

async function onVideoUrlChange() {
    const url = document.getElementById('video-url').value.trim();
    const preview = document.getElementById('url-thumbnail-preview');
    const img = document.getElementById('url-thumbnail-img');
    const badge = document.getElementById('platform-badge');
    const platform = detectPlatform(url);
    detectedPlatform = platform;
    if (platform) {
        badge.style.display = 'inline-flex';
        badge.className = 'platform-badge ' + platform.type;
        badge.textContent = platform.name;
        if (platform.thumbnail) {
            img.src = platform.thumbnail;
            preview.classList.add('active');
        } else {
            preview.classList.remove('active');
        }
        await fetchVideoTitle(url, platform);
    } else {
        badge.style.display = 'none';
        preview.classList.remove('active');
        detectedPlatform = null;
    }
}

function detectPlatform(url) {
    if (!url) return null;
    const youtubeId = extractYoutubeId(url);
    if (youtubeId) {
        return { type: 'youtube', name: 'YouTube', id: youtubeId, thumbnail: `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`, embedUrl: `https://www.youtube.com/embed/${youtubeId}` };
    }
    const vimeoMatch = url.match(/(?:vimeo\.com\/)(\d+)/);
    if (vimeoMatch) {
        return { type: 'vimeo', name: 'Vimeo', id: vimeoMatch[1], thumbnail: null, embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
    }
    const instaMatch = url.match(/(?:instagram\.com\/(?:p|reel|reels|tv)\/)([A-Za-z0-9_-]+)/);
    if (instaMatch) {
        return { type: 'instagram', name: 'Instagram', id: instaMatch[1], thumbnail: null, embedUrl: `https://www.instagram.com/p/${instaMatch[1]}/embed` };
    }
    if (url.match(/^https?:\/\/.+/)) {
        return { type: 'unknown', name: 'その他', id: null, thumbnail: null, embedUrl: url };
    }
    return null;
}

async function fetchVideoTitle(url, platform) {
    const titleInput = document.getElementById('video-title');
    if (titleInput.value.trim()) return;
    try {
        if (platform.type === 'youtube') {
            const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
            const response = await fetch(oembedUrl);
            if (response.ok) {
                const data = await response.json();
                titleInput.value = data.title || '';
            }
        } else if (platform.type === 'vimeo') {
            const vimeoInfo = await fetchVimeoInfo(platform.id);
            if (vimeoInfo.success) {
                titleInput.value = vimeoInfo.title || '';
                if (vimeoInfo.thumbnail) {
                    detectedPlatform.thumbnail = vimeoInfo.thumbnail;
                    document.getElementById('url-thumbnail-img').src = vimeoInfo.thumbnail;
                    document.getElementById('url-thumbnail-preview').classList.add('active');
                }
            }
        }
    } catch (error) { }
}

async function fetchVimeoInfo(videoId) {
    try {
        const requestUrl = CONFIG.GAS_URL + '?action=getVimeoInfo&videoId=' + videoId;
        const data = await fetchJsonp(requestUrl);
        return data;
    } catch (error) {
        console.error('Vimeo info fetch error:', error);
        return { success: false, error: error.message };
    }
}

function initDropArea() {
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('video-file');
    if (!dropArea || !fileInput) return;
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }, false);
    });
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.add('drag-over'), false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.remove('drag-over'), false);
    });
    dropArea.addEventListener('drop', e => {
        const files = e.dataTransfer.files;
        if (files.length > 0) handleFile(files[0]);
    }, false);
    dropArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });
}

function handleFile(file) {
    if (!file.type.startsWith('video/')) { showError('動画ファイルを選択してください'); return; }
    if (file.size > 50 * 1024 * 1024) {
        if (!confirm(`ファイルサイズが${formatFileSize(file.size)}あります。\nアップロードに時間がかかる可能性があります。\n続行しますか？`)) return;
    }
    if (file.size > 100 * 1024 * 1024) { showError('ファイルサイズは100MB以下にしてください'); return; }
    selectedFile = file;
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-size').textContent = formatFileSize(file.size);
    document.getElementById('selected-file').style.display = 'flex';
    document.getElementById('drop-area').style.display = 'none';
    hideError();
    const titleInput = document.getElementById('video-title');
    if (!titleInput.value.trim()) {
        const titleFromFile = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
        titleInput.value = titleFromFile;
    }
    generateVideoThumbnail(file);
}

function generateVideoThumbnail(file) {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = function() { video.currentTime = 0.1; };
    video.onseeked = function() {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
            generatedThumbnail = canvas.toDataURL('image/jpeg', 0.7);
            const preview = document.getElementById('thumbnail-preview');
            if (preview) {
                preview.innerHTML = `<img src="${generatedThumbnail}" alt="サムネイル" style="max-width:200px;max-height:120px;border-radius:4px;">`;
                preview.style.display = 'block';
            }
        } catch (e) { }
        URL.revokeObjectURL(video.src);
    };
    video.onerror = function() { URL.revokeObjectURL(video.src); };
    video.src = URL.createObjectURL(file);
}

function removeFile() {
    selectedFile = null;
    generatedThumbnail = null;
    document.getElementById('video-file').value = '';
    document.getElementById('selected-file').style.display = 'none';
    document.getElementById('drop-area').style.display = 'block';
    const preview = document.getElementById('thumbnail-preview');
    if (preview) preview.style.display = 'none';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

async function submitVideo() {
    hideError();
    const title = document.getElementById('video-title').value.trim();
    const features = document.getElementById('video-features').value.trim();
    const category = document.getElementById('video-category').value;
    if (!title) { showError('タイトルを入力してください'); return; }
    if (!features) { showError('動画の特徴を入力してください'); return; }
    if (!category) { showError('カテゴリを選択してください'); return; }
    let videoUrl = '', thumbnail = '', source = '';
    if (currentUploadType === 'url') {
        const inputUrl = document.getElementById('video-url').value.trim();
        if (!inputUrl) { showError('動画URLを入力してください'); return; }
        if (!detectedPlatform) { showError('有効なURLを入力してください'); return; }
        videoUrl = detectedPlatform.embedUrl;
        thumbnail = detectedPlatform.thumbnail || '';
        source = detectedPlatform.type;
    } else {
        if (!selectedFile) { showError('動画ファイルを選択してください'); return; }
        source = 'dropbox';
        thumbnail = document.getElementById('thumbnail-url').value.trim() || generatedThumbnail || '';
    }
    const submitBtn = document.getElementById('submit-btn');
    const progress = document.getElementById('upload-progress');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    submitBtn.disabled = true;
    progress.classList.add('active');
    try {
        if (currentUploadType === 'dropbox') {
            progressText.textContent = 'ファイルを準備中...';
            progressFill.style.width = '10%';
            const fileBase64 = await fileToBase64(selectedFile);
            progressText.textContent = 'Dropboxにアップロード中...';
            progressFill.style.width = '30%';
            const thumbnailToSend = thumbnail.startsWith('data:') ? thumbnail : '';
            await postToGas({ action: 'uploadAndSave', fileBase64: fileBase64, fileName: selectedFile.name, mimeType: selectedFile.type, title, description: features, category, thumbnail: thumbnailToSend });
            progressFill.style.width = '100%';
            progressText.textContent = '完了！';
            setTimeout(() => {
                document.getElementById('upload-form').style.display = 'none';
                document.getElementById('success-message').classList.add('active');
                generatedThumbnail = null;
                loadVideos();
            }, 500);
            return;
        }
        progressText.textContent = 'データを保存中...';
        progressFill.style.width = '90%';
        const saveResult = await postToGas({ action: 'saveVideo', title, description: features, category, thumbnail, videoUrl, source });
        if (!saveResult.success) throw new Error(saveResult.error || 'データの保存に失敗しました');
        progressFill.style.width = '100%';
        progressText.textContent = '完了！';
        setTimeout(() => {
            document.getElementById('upload-form').style.display = 'none';
            document.getElementById('success-message').classList.add('active');
            loadVideos();
        }, 500);
    } catch (error) {
        console.error('Upload error:', error);
        showError(error.message || 'アップロードに失敗しました');
        submitBtn.disabled = false;
        progress.classList.remove('active');
    }
}

function resetUploadForm() {
    document.getElementById('upload-form').style.display = 'block';
    document.getElementById('success-message').classList.remove('active');
    document.getElementById('upload-progress').classList.remove('active');
    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('submit-btn').disabled = false;
    document.getElementById('video-url').value = '';
    document.getElementById('video-title').value = '';
    document.getElementById('video-features').value = '';
    document.getElementById('video-category').value = '';
    document.getElementById('thumbnail-url').value = '';
    document.getElementById('url-thumbnail-preview').classList.remove('active');
    document.getElementById('url-thumbnail-img').src = '';
    document.getElementById('platform-badge').style.display = 'none';
    detectedPlatform = null;
    generatedThumbnail = null;
    const preview = document.getElementById('thumbnail-preview');
    if (preview) { preview.style.display = 'none'; preview.innerHTML = '<p style="font-size:12px;color:#888;margin-bottom:4px;">自動生成されたサムネイル:</p>'; }
    removeFile();
    hideError();
    selectUploadType('url');
}

function showError(message) {
    const errorEl = document.getElementById('error-message');
    document.getElementById('error-text').textContent = message;
    errorEl.classList.add('active');
}

function hideError() {
    document.getElementById('error-message').classList.remove('active');
}

function showAddCategoryModal() {
    document.getElementById('new-category-name').value = '';
    document.getElementById('category-modal').classList.add('active');
}

function closeCategoryModal() {
    document.getElementById('category-modal').classList.remove('active');
}

async function addCategory() {
    const nameInput = document.getElementById('new-category-name');
    const name = nameInput.value.trim();
    if (!name) { alert('カテゴリ名を入力してください'); return; }
    showLoading('カテゴリを作成中...');
    try {
        const result = await postToGas({ action: 'addCategory', name: name });
        hideLoading();
        if (result.success) {
            categories.push(name);
            updateCategorySelect();
            updateCategoryFilters();
            document.getElementById('video-category').value = name;
            closeCategoryModal();
        } else {
            alert(result.error || 'カテゴリの追加に失敗しました');
        }
    } catch (error) {
        hideLoading();
        console.error('Add category error:', error);
        alert('カテゴリの追加に失敗しました');
    }
}

// ===== 複数選択モード =====
function toggleSelectMode() {
    if (isSelectMode) exitSelectMode();
    else enterSelectMode();
}

function enterSelectMode() {
    isSelectMode = true;
    selectedVideos.clear();
    document.getElementById('gallery').classList.add('select-mode');
    document.getElementById('select-mode-btn').classList.add('active');
    document.getElementById('selection-toolbar').classList.add('active');
    updateSelectionCount();
}

function exitSelectMode() {
    isSelectMode = false;
    selectedVideos.clear();
    document.getElementById('gallery').classList.remove('select-mode');
    document.getElementById('select-mode-btn').classList.remove('active');
    document.getElementById('selection-toolbar').classList.remove('active');
    document.querySelectorAll('.video-card.selected').forEach(card => card.classList.remove('selected'));
}

function toggleVideoSelection(index, event) {
    event.stopPropagation();
    const filteredVideos = getFilteredVideos();
    const video = filteredVideos[index];
    const videoId = video.id;
    const card = event.currentTarget;
    if (selectedVideos.has(videoId)) {
        selectedVideos.delete(videoId);
        card.classList.remove('selected');
    } else {
        selectedVideos.add(videoId);
        card.classList.add('selected');
    }
    updateSelectionCount();
}

function updateSelectionCount() {
    const count = selectedVideos.size;
    document.getElementById('selection-count').textContent = `${count}件選択中`;
}

function selectAllVideos() {
    const filteredVideos = getFilteredVideos();
    filteredVideos.forEach(video => selectedVideos.add(video.id));
    document.querySelectorAll('.video-card').forEach(card => card.classList.add('selected'));
    updateSelectionCount();
}

function deselectAllVideos() {
    selectedVideos.clear();
    document.querySelectorAll('.video-card.selected').forEach(card => card.classList.remove('selected'));
    updateSelectionCount();
}

async function bookmarkSelectedVideos() {
    const count = selectedVideos.size;
    if (count === 0) { alert('動画を選択してください'); return; }
    const bookmarkCategory = bookmarkCategoryList[0] || 'お気に入り';
    showLoading(`${count}件の動画をブックマーク中...`);
    try {
        for (const videoId of selectedVideos) {
            const video = videos.find(v => v.id === videoId);
            if (!video) continue;
            const isAlreadyBookmarked = bookmarkData[videoId]?.bookmarkCategories?.includes(bookmarkCategory);
            if (!isAlreadyBookmarked) {
                await postToGas({ action: 'addBookmark', bookmarkCategory: bookmarkCategory, video: { id: video.id, title: video.title, description: video.description, date: video.date, thumbnail: video.thumbnail, videoUrl: video.videoUrl, source: video.source, category: video.category } });
                if (!bookmarkData[videoId]) {
                    bookmarkData[videoId] = { category: video.category || 'Uncategorized', bookmarkCategories: [bookmarkCategory], videoData: video };
                } else if (!bookmarkData[videoId].bookmarkCategories) {
                    bookmarkData[videoId].bookmarkCategories = [bookmarkCategory];
                } else if (!bookmarkData[videoId].bookmarkCategories.includes(bookmarkCategory)) {
                    bookmarkData[videoId].bookmarkCategories.push(bookmarkCategory);
                }
            }
        }
        hideLoading();
        exitSelectMode();
        renderGallery();
        updateBookmarkCount();
        updateStatus('', `${count}件の動画をブックマークしました`);
    } catch (error) {
        hideLoading();
        console.error('Bookmark error:', error);
        alert('ブックマークに失敗しました');
    }
}

async function moveSelectedToTrash() {
    const count = selectedVideos.size;
    if (count === 0) { alert('動画を選択してください'); return; }
    if (!confirm(`選択した${count}件の動画をゴミ箱に移動しますか？`)) return;
    showLoading(`${count}件の動画をゴミ箱に移動中...`);
    const videosToDelete = videos.filter(v => selectedVideos.has(v.id));
    for (const video of videosToDelete) {
        try {
            await postToGas({ action: 'deleteVideo', id: video.id, category: video.category });
        } catch (error) {
            console.error('Delete error for video:', video.id, error);
        }
        moveToTrash(video);
    }
    videos = videos.filter(v => !selectedVideos.has(v.id));
    hideLoading();
    exitSelectMode();
    renderGallery();
    updateBookmarkCount();
    updateStatus('', `${count}件の動画をゴミ箱に移動しました`);
}

// ===== ゴミ箱 =====
function loadTrashData() {
    try {
        trashData = JSON.parse(localStorage.getItem('videoTrashData') || '[]');
    } catch (e) {
        trashData = [];
    }
    updateTrashBadge();
}

function saveTrashData() {
    localStorage.setItem('videoTrashData', JSON.stringify(trashData));
    updateTrashBadge();
}

function updateTrashBadge() {
    const badge = document.getElementById('trash-badge');
    badge.textContent = trashData.length > 0 ? trashData.length : '';
}

function moveToTrash(video) {
    const trashItem = { ...video, deletedAt: new Date().toISOString() };
    trashData.push(trashItem);
    saveTrashData();
}

function openTrashModal() {
    document.getElementById('trash-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
    renderTrashGrid();
}

function closeTrashModal() {
    document.getElementById('trash-modal').classList.remove('active');
    document.body.style.overflow = '';
}

function renderTrashGrid() {
    const grid = document.getElementById('trash-grid');
    if (trashData.length === 0) {
        grid.innerHTML = `<div class="trash-empty-state" style="grid-column: 1/-1;"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg><p>ゴミ箱は空です</p></div>`;
        return;
    }
    grid.innerHTML = trashData.map((video, index) => {
        const thumbnail = video.thumbnail || getDefaultThumbnail(video) || 'https://via.placeholder.com/320x180/1a1a1a/333?text=No+Thumbnail';
        const deletedDate = new Date(video.deletedAt).toLocaleDateString('ja-JP');
        return `
            <div class="trash-item">
                <img class="trash-item-thumbnail" src="${thumbnail}" alt="${video.title}" onerror="this.src='https://via.placeholder.com/320x180/1a1a1a/333?text=No+Thumbnail'">
                <div class="trash-item-info">
                    <div class="trash-item-title">${video.title || 'Untitled'}</div>
                    <div class="trash-item-date">削除日: ${deletedDate}</div>
                    <div class="trash-item-actions">
                        <button class="restore-btn" onclick="restoreFromTrash(${index})"><svg viewBox="0 0 24 24"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9z"/></svg>戻す</button>
                        <button class="permanent-delete-btn" onclick="permanentDelete(${index})"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>完全削除</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function restoreFromTrash(index) {
    const video = trashData[index];
    if (!video) return;
    showLoading('復元中...');
    try {
        await postToGas({ action: 'saveVideo', id: video.id, title: video.title, description: video.description || '', category: video.category, thumbnail: video.thumbnail || '', videoUrl: video.videoUrl, source: video.source });
        trashData.splice(index, 1);
        saveTrashData();
        videos.push(video);
        hideLoading();
        renderTrashGrid();
        renderGallery();
        updateStatus('', '動画を復元しました');
    } catch (error) {
        hideLoading();
        console.error('Restore error:', error);
        alert('復元に失敗しました');
    }
}

async function permanentDelete(index) {
    const video = trashData[index];
    if (!video) return;
    if (!confirm(`「${video.title}」を完全に削除しますか？\n\n※この操作は取り消せません。`)) return;
    trashData.splice(index, 1);
    saveTrashData();
    renderTrashGrid();
    updateStatus('', '完全に削除しました');
}

async function emptyTrash() {
    if (trashData.length === 0) { alert('ゴミ箱は空です'); return; }
    if (!confirm(`ゴミ箱内の${trashData.length}件の動画を完全に削除しますか？\n\n※この操作は取り消せません。`)) return;
    trashData = [];
    saveTrashData();
    renderTrashGrid();
    updateStatus('', 'ゴミ箱を空にしました');
}

async function restoreAllFromTrash() {
    if (trashData.length === 0) { alert('ゴミ箱は空です'); return; }
    if (!confirm(`ゴミ箱内の${trashData.length}件の動画を全て復元しますか？`)) return;
    showLoading('復元中...');
    for (const video of trashData) {
        try {
            await postToGas({ action: 'saveVideo', id: video.id, title: video.title, description: video.description || '', category: video.category, thumbnail: video.thumbnail || '', videoUrl: video.videoUrl, source: video.source });
            videos.push(video);
        } catch (error) {
            console.error('Restore error:', error);
        }
    }
    trashData = [];
    saveTrashData();
    hideLoading();
    renderTrashGrid();
    renderGallery();
    updateStatus('', '全ての動画を復元しました');
}
