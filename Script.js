class MovieExplorer {
    constructor() {
        this.API_KEY = "658057f82d26ab78b92edb74ca78985f";
        this.BASE_URL = "https://api.themoviedb.org/3";
        this.IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
        this.FALLBACK_IMAGE_URL =
            'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjgwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDI4MCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyODAiIGhlaWdodD0iMzAwIiBmaWxsPSIjMzMzIi8+Cjx0ZXh0IHg9IjE0MCIgeT0iMTUwIiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+Tm8gSW1hZ2U8L3RleHQ+Cjwvc3ZnPg==';

        this.genres = {};
        this.currentPage = 1;
        this.isSearching = false;
        this.currentFilter = {
            genre: '',
            year: '',
            sort: ''
        };

        this.init();
    }

    openPlayerForCreator(payload) {
        if (!this.currentUser) {
            window.location.href = "login.html";
            return;
        }
        this.showModal();
        const url = payload.sourceType === 'file' ? payload.videoPath : payload.videoUrl;
        if (!url) { this.showNoTrailer(); return; }
        const ytMatch = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(url);
        if (ytMatch && ytMatch[1]) {
            this.useYouTube(ytMatch[1]);
            return;
        }

        if (this.mp4Player && this.mp4Source) {
            this.ytContainer && (this.ytContainer.style.display = 'none');
            this.mp4Source.src = url;
            this.mp4Player.style.display = 'block';
            this.mp4Player.load();
            try { this.mp4Player.play(); } catch(_){}
        } else {
            this.showNoTrailer();
        }
     
        this.resetMetaPanel();
        if (this.metaTitle) this.metaTitle.textContent = payload.title || 'Creator Upload';
        if (this.metaDesc) this.metaDesc.textContent = payload.description || '';
        if (this.castList) this.castList.innerHTML = '<div class="meta-item">Not available</div>';
        if (this.crewList) this.crewList.innerHTML = '<div class="meta-item">Not available</div>';
        this.showMetaContent();
    }

    async init() {
        this.cacheDom();
        this.setupEventListeners();
        this.applyAuthUI();
        if (!this.currentUser) {
            window.location.href = "login.html";
            return;
        }
        this.loadGenres();
        this.setupYearFilter();
        this.loadTrendingMovies();
        this.loadRandomMovies();
        this.loadTrendingSeries();
        this.loadCreatorMovies();
    }

    cacheDom() {
        this.moviesGrid = document.getElementById("moviesGrid");
        this.trendingCarousel = document.getElementById("trendingCarousel");
        this.creatorGrid = document.getElementById("creatorGrid");
        this.playerModal = document.getElementById("playerModal");
        this.playerBackdrop = document.getElementById("playerBackdrop");
        this.playerClose = document.getElementById("playerClose");
        this.ytContainer = document.getElementById("ytContainer");
        this.ytPlayer = document.getElementById("ytPlayer");
        this.mp4Player = document.getElementById("mp4Player");
        this.mp4Source = document.getElementById("mp4Source");
        this.logoutBtn = document.getElementById("logoutBtn");
        this.loginLink = document.getElementById("loginLink");
        this.creatorDashLink = document.getElementById("creatorDashLink");
        this.metaLoading = document.getElementById("metaLoading");
        this.metaContent = document.getElementById("metaContent");
        this.metaTitle = document.getElementById("metaTitle");
        this.metaDesc = document.getElementById("metaDesc");
        this.castList = document.getElementById("castList");
        this.crewList = document.getElementById("crewList");
        this.seriesGrid = document.getElementById("seriesGrid");
        this.creatorMoviesGrid = document.getElementById("creatorMoviesGrid");
        this.creatorWebGrid = document.getElementById("creatorWebGrid");
        this.creatorSportsGrid = document.getElementById("creatorSportsGrid");
    }

    setupEventListeners() {
        const searchInput = document.getElementById("searchInput");
        const genreFilter = document.getElementById("genreFilter");
        const yearFilter = document.getElementById("yearFilter");
        const sortFilter = document.getElementById("sortFilter");
        const clearButton = document.getElementById("clearButton");
        const trendingPrevious = document.getElementById("trendingPrevious");
        const trendingNext = document.getElementById("trendingNext");

        let searchTimeout;
        searchInput.addEventListener("input", (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.handleSearch(e.target.value);
            }, 500);
        });

        genreFilter.addEventListener("change", () => this.handleFilterChange());
        yearFilter.addEventListener("change", () => this.handleFilterChange());
        sortFilter.addEventListener("change", () => this.handleFilterChange());
        clearButton.addEventListener("click", () => this.handleClearFilters());

        trendingPrevious.addEventListener("click", () => this.scrollCarousel("previous"));
        trendingNext.addEventListener("click", () => this.scrollCarousel("next"));

        this.moviesGrid.addEventListener("click", (e) => {
            const card = e.target.closest(".movie-card");
            if (card) {
                const id = card.getAttribute("data-id");
                if (id) this.openPlayerByMovieId(id);
            }
        });
        if (this.creatorGrid) {
            this.creatorGrid.addEventListener("click", (e) => {
                const card = e.target.closest(".creator-card");
                if (card) {
                    const payload = card.dataset.payload ? JSON.parse(card.dataset.payload) : null;
                    if (payload) this.openPlayerForCreator(payload);
                }
            });
        }
        this.trendingCarousel.addEventListener("click", (e) => {
            const card = e.target.closest(".trending-card");
            if (card) {
                const id = card.getAttribute("data-id");
                if (id) this.openPlayerByMovieId(id);
            }
        });
        if (this.seriesGrid) {
            this.seriesGrid.addEventListener("click", (e) => {
                const card = e.target.closest(".series-card");
                if (card) {
                    const id = card.getAttribute("data-id");
                    if (id) this.openPlayerByTvId(id);
                }
            });
        }

        if (this.playerClose) this.playerClose.addEventListener("click", () => this.closePlayer());
        if (this.playerBackdrop) this.playerBackdrop.addEventListener("click", () => this.closePlayer());

        if (this.logoutBtn) this.logoutBtn.addEventListener("click", () => this.logout());
    }


    get currentUser() {
        try {
            const raw = localStorage.getItem("ss_user");
            return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
    }

    applyAuthUI() {
        const isLoggedIn = !!this.currentUser;
        if (this.loginLink) this.loginLink.style.display = isLoggedIn ? "none" : "inline-block";
        if (this.logoutBtn) this.logoutBtn.style.display = isLoggedIn ? "inline-block" : "none";
        if (this.creatorDashLink) {
            const showCreator = isLoggedIn && this.currentUser.role === 'creator';
            this.creatorDashLink.style.display = showCreator ? "inline-block" : "none";
        }
    }


    async loadSports() {
        const grid = document.getElementById("moviesGrid");
        try {
            grid.innerHTML = '<div class="loading">Loading Sports...</div>';
            const res = await fetch('/api/movies/public');
            const data = await res.json();
            const items = (data.movies || []).filter(m => m.category === 'sports');
            const sortBy = document.getElementById("sortFilter").value;
            if (sortBy === 'Alphabetical') items.sort((a,b)=>(a.title||'').localeCompare(b.title||''));
            grid.innerHTML = items.map(m => this.createCreatorCard(m)).join('') || '<div class="no-results">No sports content yet.</div>';
        } catch (e) {
            grid.innerHTML = '<div class="error">Failed to load Sports.</div>';
        }
    }

    logout() {
        localStorage.removeItem("ss_user");
        this.applyAuthUI();
        window.location.href = "login.html";
    }

    async loadGenres() {
        try {
            const response = await fetch(`${this.BASE_URL}/genre/movie/list?api_key=${this.API_KEY}`);
            const data = await response.json();

            this.genres = data.genres.reduce((acc, genre) => {
                acc[genre.id] = genre.name;
                return acc;
            }, {});

            const genreSelect = document.getElementById("genreFilter");
            data.genres.forEach(genre => {
                const option = document.createElement("option");
                option.value = genre.id;
                option.textContent = genre.name;
                genreSelect.appendChild(option);
            });
        } catch (error) {
            console.error("Error loading genres:", error);
        }
    }

    setupYearFilter() {
        const yearSelect = document.getElementById("yearFilter");
        const currentYear = new Date().getFullYear();

        for (let year = currentYear; year >= 1990; year--) {
            const option = document.createElement("option");
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        }
    }

    async loadTrendingMovies() {
        try {
            const response = await fetch(`${this.BASE_URL}/trending/movie/week?api_key=${this.API_KEY}`);
            const data = await response.json();
            const trendingMovies = data.results.slice(0, 10);
            this.displayTrendingMovies(trendingMovies);
        } catch (error) {
            console.error("Error fetching trending movies:", error);
            document.getElementById("trendingCarousel").innerHTML =
                "<div>Failed to load trending movies. Please try again later.</div>";
        }
    }

    displayTrendingMovies(movies) {
        const carousel = document.getElementById("trendingCarousel");
        carousel.innerHTML = movies.map((movie, index) => this.createTrendingCard(movie, index + 1)).join("");
    }

    createTrendingCard(movie, index) {
        const posterPath = movie.poster_path ? `${this.IMAGE_BASE_URL}${movie.poster_path}` : this.FALLBACK_IMAGE_URL;
        const rating = movie.vote_average ? movie.vote_average.toFixed(1) : "N/A";
        const year = movie.release_date ? new Date(movie.release_date).getFullYear() : "TBA";
        const genre = movie.genre_ids && movie.genre_ids.length
            ? movie.genre_ids.slice(0, 2).map(id => this.genres[id]).filter(Boolean).join(", ")
            : "N/A";

        return `
            <div class="trending-card" data-id="${movie.id}">
                <div class="trending-rank">${index}</div>
                <img src="${posterPath}" 
                     alt="${movie.title} Poster" 
                     class="movie-poster" 
                     loading="lazy"
                     onerror="this.src='${this.FALLBACK_IMAGE_URL}'"/>
                <div class="trending-overlay">
                    <div class="trending-title">${movie.title}</div>
                    <div class="trending-details">
                        <span class="trending-year">${year}</span>
                        <span class="trending-rating">⭐ ${rating}</span>
                    </div>
                    <div class="trending-genre">${genre}</div>
                </div>
            </div>
        `;
    }

    async loadRandomMovies() {
        try {
            const randomPage = Math.floor(Math.random() * 10) + 1;
            let url = `${this.BASE_URL}/discover/movie?api_key=${this.API_KEY}&page=${randomPage}`;

            if (this.currentFilter.sort) {
                url += `&sort_by=${this.currentFilter.sort}`;
            }
            if (this.currentFilter.genre) {
                url += `&with_genres=${this.currentFilter.genre}`;
            }
            if (this.currentFilter.year) {
                url += `&primary_release_year=${this.currentFilter.year}`;
            }

            const response = await fetch(url);
            const data = await response.json();
            this.displayMovies(data.results, "moviesGrid");
        } catch (error) {
            console.error("Error loading random movies:", error);
            document.getElementById("moviesGrid").innerHTML =
                '<div class="error">Failed to load movies. Please try again later.</div>';
        }
    }

    displayMovies(movies, containerId) {
        const container = document.getElementById(containerId);

        if (!movies || movies.length === 0) {
            container.innerHTML = `
                <div class="no-results">
                    <h2>No movies found.</h2>
                    <p>Try adjusting your search criteria.</p>
                </div>`;
            return;
        }

        container.innerHTML = movies.map(movie => this.createMovieCard(movie)).join("");
    }

    createMovieCard(movie) {
        const posterPath = movie.poster_path ? `${this.IMAGE_BASE_URL}${movie.poster_path}` : this.FALLBACK_IMAGE_URL;
        const rating = movie.vote_average ? movie.vote_average.toFixed(1) : "N/A";
        const year = movie.release_date ? new Date(movie.release_date).getFullYear() : "TBA";
        const description = movie.overview || "No description available.";
        const genre = movie.genre_ids && movie.genre_ids.length
            ? movie.genre_ids.slice(0, 2).map(id => this.genres[id]).filter(Boolean).join(", ")
            : "N/A";

        return `
            <div class="movie-card" data-id="${movie.id}">
                <img src="${posterPath}" 
                     alt="${movie.title} Poster" 
                     class="movie-poster" 
                     loading="lazy"
                     onerror="this.src='${this.FALLBACK_IMAGE_URL}'"/>
                <div class="movie-info">
                    <div class="movie-title">${movie.title}</div>
                    <div class="movie-details">
                        <span class="movie-year">${year}</span>
                        <span class="movie-rating">⭐ ${rating}</span>
                    </div>
                    <div class="movie-genre">${genre}</div>
                    <div class="movie-description">${description}</div>
                </div>
            </div>
        `;
    }

    async openPlayerByMovieId(movieId) {
        if (!this.currentUser) {
            window.location.href = "login.html";
            return;
        }

        try {
            const trailerKey = await this.fetchTrailerKey(movieId);
            this.showModal();
            if (trailerKey) {
                this.useYouTube(trailerKey);
            } else {
                this.showNoTrailer();
            }
            this.loadMetaForMovie(movieId);
        } catch (e) {
            console.error("Error opening player:", e);
            this.showNoTrailer();
        }
    }

    async fetchTrailerKey(movieId) {
        const url = `${this.BASE_URL}/movie/${movieId}/videos?api_key=${this.API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data || !Array.isArray(data.results)) return null;
        const trailer = data.results.find(v => v.site === "YouTube" && v.type === "Trailer")
            || data.results.find(v => v.site === "YouTube");
        return trailer ? trailer.key : null;
    }

    showModal() {
        if (!this.playerModal) return;
        this.playerModal.setAttribute("aria-hidden", "false");
        this.playerModal.style.display = "block";
        document.body.style.overflow = "hidden";
        if (this.ytContainer) this.ytContainer.innerHTML = '<iframe id="ytPlayer" title="Trailer" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>';
        this.ytPlayer = document.getElementById("ytPlayer");
        this.resetMetaPanel();
    }

    closePlayer() {
        if (!this.playerModal) return;
        if (this.ytPlayer) this.ytPlayer.src = "";
        if (this.mp4Player) {
            try { this.mp4Player.pause(); } catch(_){}
            if (this.mp4Source) this.mp4Source.src = "";
            this.mp4Player.load();
            this.mp4Player.style.display = "none";
        }
        if (this.ytContainer) this.ytContainer.style.display = "none";
        this.playerModal.setAttribute("aria-hidden", "true");
        this.playerModal.style.display = "none";
        document.body.style.overflow = "auto";
    }

    useYouTube(key) {
        if (!this.ytContainer) return;
        this.ytContainer.style.display = "block";
        if (!this.ytPlayer) this.ytPlayer = document.getElementById("ytPlayer");
        if (this.ytPlayer) {
            const url = `https://www.youtube.com/embed/${key}?autoplay=1&rel=0`;
            this.ytPlayer.src = url;
        }
        if (this.mp4Player) this.mp4Player.style.display = "none";
    }

    showNoTrailer() {
        if (!this.ytContainer) return;
        this.ytContainer.style.display = "block";
        this.ytContainer.innerHTML = '<div class="no-trailer">Trailer not available.</div>';
    }

    async loadCreatorMovies() {
        try {
            const res = await fetch('/api/movies/public');
            const data = await res.json();
            if (!data || !data.ok) throw new Error('bad');
            const movies = (data.movies || []);
            if (this.creatorGrid) {
              const items = movies.map(m => this.createCreatorCard(m)).join('');
              this.creatorGrid.innerHTML = items || '<div class="no-results">No creator uploads yet.</div>';
            }
            if (this.creatorMoviesGrid) this.creatorMoviesGrid.innerHTML = movies.filter(m=>m.category==='movie').map(m=>this.createCreatorCard(m)).join('') || '<div class="no-results">No creator movies yet.</div>';
            if (this.creatorWebGrid) this.creatorWebGrid.innerHTML = movies.filter(m=>m.category==='webseries').map(m=>this.createCreatorCard(m)).join('') || '<div class="no-results">No creator web series yet.</div>';
            if (this.creatorSportsGrid) this.creatorSportsGrid.innerHTML = movies.filter(m=>m.category==='sports').map(m=>this.createCreatorCard(m)).join('') || '<div class="no-results">No creator sports yet.</div>';
        } catch (e) {
            if (this.creatorGrid) this.creatorGrid.innerHTML = '<div class="error">Failed to load creator uploads.</div>';
            if (this.creatorMoviesGrid) this.creatorMoviesGrid.innerHTML = '<div class="error">Failed to load creator movies.</div>';
            if (this.creatorWebGrid) this.creatorWebGrid.innerHTML = '<div class="error">Failed to load creator web series.</div>';
            if (this.creatorSportsGrid) this.creatorSportsGrid.innerHTML = '<div class="error">Failed to load creator sports.</div>';
        }
    }

    createCreatorCard(m) {
        const poster = m.poster || this.FALLBACK_IMAGE_URL;
        const payload = {
            sourceType: m.sourceType,
            videoPath: m.videoPath,
            videoUrl: m.videoUrl,
            title: m.title,
            description: m.description || ''
        };
        return `
            <div class="creator-card" data-payload='${JSON.stringify(payload)}'>
                <img src="${poster}" alt="${m.title} Poster" class="movie-poster" onerror="this.src='${this.FALLBACK_IMAGE_URL}'"/>
                <div class="movie-info">
                    <div class="movie-title">${m.title}</div>
                    <div class="movie-genre">StreamSphere • Creator</div>
                </div>
            </div>
        `;
    }

    resetMetaPanel() {
        if (this.metaLoading) this.metaLoading.style.display = 'block';
        if (this.metaContent) this.metaContent.style.display = 'none';
        if (this.metaTitle) this.metaTitle.textContent = '';
        if (this.metaDesc) this.metaDesc.textContent = '';
        if (this.castList) this.castList.innerHTML = '';
        if (this.crewList) this.crewList.innerHTML = '';
    }

    showMetaContent() {
        if (this.metaLoading) this.metaLoading.style.display = 'none';
        if (this.metaContent) this.metaContent.style.display = 'block';
    }

    async loadMetaForMovie(movieId) {
        try {
            const [details, credits] = await Promise.all([
                this.fetchMovieDetails(movieId),
                this.fetchMovieCredits(movieId)
            ]);
            if (this.metaTitle) this.metaTitle.textContent = details && details.title ? details.title : '';
            if (this.metaDesc) this.metaDesc.textContent = details && details.overview ? details.overview : '';
            if (this.castList) this.castList.innerHTML = this.renderPeople((credits && credits.cast) || [], true);
            if (this.crewList) this.crewList.innerHTML = this.renderPeople((credits && credits.crew) || [], false);
            this.showMetaContent();
        } catch (e) {
            console.error('Meta load failed', e);
            if (this.metaLoading) this.metaLoading.textContent = 'Details unavailable.';
        }
    }

    async fetchMovieDetails(movieId) {
        const res = await fetch(`${this.BASE_URL}/movie/${movieId}?api_key=${this.API_KEY}`);
        return await res.json();
    }

    async fetchMovieCredits(movieId) {
        const res = await fetch(`${this.BASE_URL}/movie/${movieId}/credits?api_key=${this.API_KEY}`);
        return await res.json();
    }

    renderPeople(list, isCast) {
        if (!Array.isArray(list) || list.length === 0) return '<div class="meta-item">Not available</div>';
        const sliced = list.slice(0, isCast ? 8 : 8);
        return sliced.map(p => {
            const name = p.name || p.original_name || 'Unknown';
            const role = isCast ? (p.character || '') : (p.job || '');
            return `<div class="meta-item">${name} <span class="meta-role">${role ? '• ' + role : ''}</span></div>`;
        }).join('');
    }

    sortMovies(movies, sortBy) {
        switch (sortBy) {
            case "Alphabetical":
                return movies.sort((a, b) => a.title.localeCompare(b.title));
            case "Latest":
                return movies.sort((a, b) => new Date(b.release_date) - new Date(a.release_date));
            case "Highest Rating":
                return movies.sort((a, b) => b.vote_average - a.vote_average);
            default:
                return movies;
        }
    }

    handleClearFilters() {
        const trendingSection = document.getElementById("trendingSection");
        document.getElementById("searchInput").value = "";
        document.getElementById("genreFilter").value = "All";
        document.getElementById("yearFilter").value = "All";
        document.getElementById("sortFilter").value = "Relevance";

        document.getElementById("clearButton").classList.remove("show");
        document.getElementById("randomSectionTitle").textContent = "Discover Movies";

        trendingSection.style.display = "block";

        this.currentFilter = { genre: '', year: '', sort: '' };
        this.isSearching = false;
        this.loadRandomMovies();
    }

    async handleFilterChange() {
        const searchInput = document.getElementById("searchInput");
        const genreFilter = document.getElementById("genreFilter");
        const yearFilter = document.getElementById("yearFilter");
        const sortFilter = document.getElementById("sortFilter");
        const clearButton = document.getElementById("clearButton");
        const trendingSection = document.getElementById("trendingSection");

        this.currentFilter = {
            genre: genreFilter.value !== "All" ? genreFilter.value : "",
            year: yearFilter.value !== "All" ? yearFilter.value : "",
            sort: sortFilter.value !== "Relevance" ? sortFilter.value : ""
        };

        if (genreFilter.value === 'Sports') {
            clearButton.classList.add("show");
            trendingSection.style.display = "none";
            document.getElementById("randomSectionTitle").textContent = "Sports";
            await this.loadSports();
            return;
        }

        if (this.currentFilter.genre || this.currentFilter.year || this.currentFilter.sort || searchInput.value.trim()) {
            clearButton.classList.add("show");
        } else {
            clearButton.classList.remove("show");
        }

        if (searchInput.value.trim()) {
            trendingSection.style.display = "none";
            await this.handleSearch(searchInput.value.trim());
        } else {
            if (this.currentFilter.genre || this.currentFilter.sort) {
                trendingSection.style.display = "none";
                document.getElementById("randomSectionTitle").textContent = "Filtered Movies";
            } else {
                trendingSection.style.display = "block";
                document.getElementById("randomSectionTitle").textContent = "Discover Movies";
            }
            await this.loadFilteredMovies();
        }
    }

    async loadFilteredMovies() {
        try {
            document.getElementById("moviesGrid").innerHTML =
                '<div class="loading">Loading Filtered Movies...</div>';

            let url = `${this.BASE_URL}/discover/movie?api_key=${this.API_KEY}&page=1`;
            if (this.currentFilter.genre) {
                url += `&with_genres=${this.currentFilter.genre}`;
            }
            if (this.currentFilter.year) {
                url += `&primary_release_year=${this.currentFilter.year}`;
            }
            if (this.currentFilter.sort) {
                url += `&sort_by=${this.currentFilter.sort}`;
            }

            const response = await fetch(url);
            const data = await response.json();
            this.displayMovies(data.results, "moviesGrid");
        } catch (error) {
            console.error("Error loading filtered movies:", error);
            document.getElementById("moviesGrid").innerHTML =
                '<div class="error">Failed to load filtered movies.</div>';
        }
    }

    async handleSearch(query) {
        const q = (query || '').trim();
        const trendingSection = document.getElementById("trendingSection");
        const titleEl = document.getElementById("randomSectionTitle");
        const grid = document.getElementById("moviesGrid");
        if (!q) {
            this.isSearching = false;
            if (trendingSection) trendingSection.style.display = "block";
            if (titleEl) titleEl.textContent = "Discover Movies";
            await this.loadRandomMovies();
            return;
        }
        this.isSearching = true;
        if (trendingSection) trendingSection.style.display = "none";
        if (titleEl) titleEl.textContent = `Search Results for "${q}"`;
        try {
            grid.innerHTML = '<div class="loading">Searching...</div>';
            const url = `${this.BASE_URL}/search/movie?api_key=${this.API_KEY}&query=${encodeURIComponent(q)}&page=1&include_adult=false`;
            const res = await fetch(url);
            const data = await res.json();
            const results = Array.isArray(data.results) ? data.results : [];
            this.displayMovies(results, "moviesGrid");
            const clearButton = document.getElementById("clearButton");
            if (clearButton) clearButton.classList.add("show");
        } catch (e) {
            console.error("Search failed", e);
            grid.innerHTML = '<div class="error">Search failed. Please try again.</div>';
        }
    }

    scrollCarousel(direction) {
        const carousel = document.getElementById("trendingCarousel");
        const scrollAmount = 320;
        if (direction === "previous") {
            carousel.scrollBy({ left: -scrollAmount, behavior: "smooth" });
        } else {
            carousel.scrollBy({ left: scrollAmount, behavior: "smooth" });
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    new MovieExplorer();
});
