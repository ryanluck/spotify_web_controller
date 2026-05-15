var spotifyHandler = {
	scopes: ["user-read-private", "user-read-currently-playing", "user-read-playback-state", "user-modify-playback-state", "user-read-recently-played", "user-library-read", "user-library-modify", "playlist-read-private", "playlist-read-collaborative", "streaming"],
	expires: -1,
	api: new SpotifyWebApi(),
	dom: {},
	progress: 0,
	duration: 0,
	lastTrackId: "null2",
	lastPlaybackStatus: {},
	likeCheckDisabled: false,
	webPlayer: null,
	webPlayerDeviceId: null,
	webPlayerActivated: false,
	changingVolume: false,
	volumeCooldown: false,

	clientId: "958af218b7f249d38baf29604b851d57",
	buildCommit: "__BUILD_COMMIT__",

	generateCodeVerifier: function() {
		var array = new Uint8Array(64);
		window.crypto.getRandomValues(array);
		return btoa(String.fromCharCode.apply(null, array))
			.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	},

	generateCodeChallenge: function(verifier) {
		var encoder = new TextEncoder();
		var data = encoder.encode(verifier);
		return window.crypto.subtle.digest('SHA-256', data).then(function(digest) {
			return btoa(String.fromCharCode.apply(null, new Uint8Array(digest)))
				.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
		});
	},

	signIn: function() {
		var codeVerifier = spotifyHandler.generateCodeVerifier();
		setCookie("spcv", codeVerifier);
		var redirectUri = window.location.origin + window.location.pathname;
		spotifyHandler.generateCodeChallenge(codeVerifier).then(function(codeChallenge) {
			window.location.href = "https://accounts.spotify.com/authorize?client_id="+spotifyHandler.clientId+"&response_type=code&redirect_uri="+encodeURIComponent(redirectUri)+"&scope="+spotifyHandler.scopes.join("%20")+"&show_dialog=false&state="+state+"&code_challenge_method=S256&code_challenge="+codeChallenge;
		});
	},

	exchangeCodeForToken: function(code, callback) {
		var codeVerifier = getCookie("spcv");
		if (!codeVerifier) {
			callback("No code verifier found", null);
			return;
		}
		var body = new URLSearchParams({
			grant_type: "authorization_code",
			code: code,
			redirect_uri: window.location.origin + window.location.pathname,
			client_id: spotifyHandler.clientId,
			code_verifier: codeVerifier
		});
		fetch("https://accounts.spotify.com/api/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: body.toString()
		}).then(function(response) {
			return response.json();
		}).then(function(data) {
			if (data.access_token) {
				localStorage.removeItem("spotify_code_verifier");
				deleteCookie("spcv");
				callback(null, data);
			} else {
				callback(data.error || "Token exchange failed", null);
			}
		}).catch(function(err) {
			callback(err, null);
		});
	},

	refreshAccessToken: function(callback) {
		var refreshToken = getCookie("sprt");
		if (!refreshToken) {
			console.warn("No refresh token available, redirecting to sign in...");
			if (callback) callback(false);
			else window.location.href = window.location.origin + window.location.pathname;
			return;
		}
		var body = new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: spotifyHandler.clientId
		});
		fetch("https://accounts.spotify.com/api/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: body.toString()
		}).then(function(response) {
			return response.json();
		}).then(function(data) {
			if (data.access_token) {
				setCookie("spat", data.access_token);
				spotifyHandler.expires = new Date().getTime() + (parseInt(data.expires_in) * 1000);
				setCookie("spex", spotifyHandler.expires);
				spotifyHandler.api.setAccessToken(data.access_token);
				if (data.refresh_token) {
					setCookie("sprt", data.refresh_token);
				}
				if (callback) callback(true);
			} else {
				console.error("Failed to refresh token", data);
				deleteCookie("spat");
				deleteCookie("spex");
				deleteCookie("sprt");
				if (callback) callback(false);
				else window.location.href = window.location.origin + window.location.pathname;
			}
		}).catch(function(err) {
			console.error("Error refreshing token", err);
			// Network error — don't wipe cookies, just report failure
			if (callback) callback(false);
		});
	},

	checkAccessToken: function() {
		if ((new Date().getTime() + 25000) >= spotifyHandler.expires) {
			console.warn("Spotify Access Token is about to expire! Refreshing...");
			spotifyHandler.refreshAccessToken();
		}
	},

	setCurrentlyPlaying: function() {
		if (!document.hidden) {
			spotifyHandler.api.getMyCurrentPlaybackState({}, function(err, data) {
				if (err) {
					console.error(err);
				}
				else if (data != undefined && typeof data != "string" && data.item != null) {
					spotifyHandler.lastPlaybackStatus = data;
					if (pageHandler.shown == "discoverpage") {
						pageHandler.showPage("playerpage");
					}
					if (data.item.id == null) {
						data.item.id = data.item.uri.split(":").pop();
					}
					if (data.item.id != spotifyHandler.lastTrackId) {
						spotifyHandler.lastTrackId = data.item.id;
						if (data.item.album.images.length > 0) {
							spotifyHandler.dom.artwork.src = data.item.album.images[0].url;
						}
						else {
							spotifyHandler.dom.artwork.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
						}
						spotifyHandler.dom.title.innerHTML = stripTags(data.item.name);
						var tempArtists = "";
						for (var i = 0; i < data.item.artists.length; i++) {
							tempArtists += data.item.artists[i].name;
							if (i != data.item.artists.length - 1) {
								tempArtists += ", ";
							}
						}
						spotifyHandler.dom.artist.innerHTML = stripTags(tempArtists);
						if (data.context != null) {
							switch (data.context.type) {
								case "playlist": {
									spotifyHandler.api.getPlaylist(data.context.uri.split(":").pop(), {fields: "name,id"}, function(err, data) {
										if (!err && data) {
											spotifyHandler.dom.playingFrom.innerHTML = "Playing from playlist";
											spotifyHandler.dom.playingFromName.innerHTML = stripTags(data.name);
											spotifyHandler.dom.contextName.innerHTML = stripTags(data.name);
											spotifyHandler.fillQueue("playlist", data.id);
										}
									});
									break;
								}
								case "album": {
									spotifyHandler.api.getAlbum(data.context.uri.split(":").pop(), {}, function(err, data) {
										if (!err && data) {
											spotifyHandler.dom.playingFrom.innerHTML = "Playing from album";
											spotifyHandler.dom.playingFromName.innerHTML = stripTags(data.name);
											spotifyHandler.dom.contextName.innerHTML = stripTags(data.name);
											spotifyHandler.fillQueue("album", data.id);
										}
									});
									break;
								}
								case "artist": {
									spotifyHandler.api.getArtist(data.context.uri.split(":").pop(), {}, function(err, data) {
										if (!err && data) {
											spotifyHandler.dom.playingFrom.innerHTML = "Playing from artist";
											spotifyHandler.dom.playingFromName.innerHTML = stripTags(data.name);
											spotifyHandler.dom.contextName.innerHTML = stripTags(data.name);
											spotifyHandler.fillQueue("artist", data.id);
										}
									});
									break;
								}
								default: {
									spotifyHandler.dom.playingFrom.innerHTML = "";
									spotifyHandler.dom.playingFromName.innerHTML = "";
									spotifyHandler.dom.contextName.innerHTML = "";
									spotifyHandler.fillQueue(null, null);
									break;
								}
							}
						}
						else {
							spotifyHandler.dom.playingFrom.innerHTML = "Playing from Your Library";
							spotifyHandler.dom.playingFromName.innerHTML = "Liked Songs";
							spotifyHandler.dom.contextName.innerHTML = "Liked Songs";
							spotifyHandler.fillQueue("library", "library");
						}
						if ('mediaSession' in navigator)
						{
							navigator.mediaSession.playbackState = "playing";
							var tempArtwork = [];
							for (var i = 0; i < data.item.album.images.length; i++) {
								tempArtwork[i] = {
									sizes: data.item.album.images[i].width+"x"+data.item.album.images[i].height,
									src: data.item.album.images[i].url,
									type: "image/jpeg"
								};
							}
							navigator.mediaSession.metadata = new MediaMetadata({
								title: data.item.name,
								artist: tempArtists,
								artwork: tempArtwork
							});
						}
						spotifyHandler.duration = Math.floor(data.item.duration_ms / 1000);
					}
					spotifyHandler.progress = Math.floor(data.progress_ms / 1000);
					if (!progressBar.hovering) {
						progressBar.setValue((data.progress_ms / data.item.duration_ms) * 100);
						spotifyHandler.updateTimes(spotifyHandler.progress, spotifyHandler.duration);
					}

					if (data.device.volume_percent != null) {
						spotifyHandler.dom.volumebar.disabled = false;
						if (!spotifyHandler.changingVolume && !spotifyHandler.volumeCooldown) {
							spotifyHandler.setVolume(data.device.volume_percent, true);
						}
					}
					else {
						spotifyHandler.dom.volumebar.disabled = true;
					}
					
					if (data.is_playing) {
						spotifyHandler.dom.playPauseButton.title = "Pause";
						spotifyHandler.dom.playPauseButton.innerHTML = "&#xe035;";
					}
					else {
						spotifyHandler.dom.playPauseButton.title = "Play";
						spotifyHandler.dom.playPauseButton.innerHTML = "&#xe038;";
					}

					if (!data.item.is_local) {
						if (!spotifyHandler.likeCheckDisabled) {
							spotifyHandler.likeCheckDisabled = true;
							spotifyHandler.api.containsMySavedTracks([data.item.id], {}, function(err, data) {
								if (err) {
									// Can't check liked status, hide the button
									spotifyHandler.dom.likeButton.disabled = true;
									spotifyHandler.dom.likeButton.style.display = "none";
								}
								else {
									spotifyHandler.dom.likeButton.disabled = false;
									spotifyHandler.dom.likeButton.style.display = "inline-block";
									if (data[0]) {
										spotifyHandler.dom.likeButton.innerHTML = "&#xe87d;";
										spotifyHandler.dom.likeButton.style.color = "#1DB954";
										spotifyHandler.dom.likeButton.title = "Remove from liked songs";
										spotifyHandler.dom.likeButton.setAttribute("data-liked", "true");
									}
									else {
										spotifyHandler.dom.likeButton.innerHTML = "&#xe87e;";
										spotifyHandler.dom.likeButton.style.color = null;
										spotifyHandler.dom.likeButton.title = "Add to liked songs";
										spotifyHandler.dom.likeButton.setAttribute("data-liked", "false");
									}
								}
							});
						}
					}
					else {
						spotifyHandler.dom.likeButton.disabled = true;
						spotifyHandler.dom.likeButton.style.display = "none";
					}

					if (data.shuffle_state) {
						spotifyHandler.dom.shuffleButton.style.color = "#1DB954";
						spotifyHandler.dom.shuffleButton.className = "material-icons side-button dotted";
					}
					else {
						spotifyHandler.dom.shuffleButton.style.color = null;
						spotifyHandler.dom.shuffleButton.className = "material-icons side-button";
					}

					switch (data.repeat_state) {
						case "context":
							spotifyHandler.dom.repeatButton.style.color = "#1DB954";
							spotifyHandler.dom.repeatButton.innerHTML = "&#xe040;";
							spotifyHandler.dom.repeatButton.className = "material-icons side-button dotted";
							break;
						case "track":
							spotifyHandler.dom.repeatButton.style.color = "#1DB954";
							spotifyHandler.dom.repeatButton.innerHTML = "&#xe041;";
							spotifyHandler.dom.repeatButton.className = "material-icons side-button dotted";
							break;
						default:
						case "off":
							spotifyHandler.dom.repeatButton.style.color = null;
							spotifyHandler.dom.repeatButton.innerHTML = "&#xe040;";
							spotifyHandler.dom.repeatButton.className = "material-icons side-button";
							break;
					}
				}
				else {
					if (spotifyHandler.lastTrackId != "null2") {
						setTimeout(function() {
							spotifyHandler.refreshDevices();
						}, 500);
					}
					// If web player is ready, transfer playback to it
					if (spotifyHandler.webPlayerDeviceId && !spotifyHandler.webPlayerActivated) {
						spotifyHandler.webPlayerActivated = true;
						spotifyHandler.transferPlayback(spotifyHandler.webPlayerDeviceId);
					} else if (spotifyHandler.webPlayerActivated && !spotifyHandler.webPlayerDeviceId) {
						// SDK disconnected — show discover page so user can pick a device
						if (pageHandler.shown == "playerpage" && spotifyHandler.lastTrackId == "null2") {
							pageHandler.showPage("discoverpage");
						}
					}
					// Otherwise stay on current page while waiting for SDK
				}
			});
		}
	},

	fixArtSize: function() {
		var maxHeight = document.getElementById("below-art-holder").offsetTop - 42 - 48;
		var maxWidth = window.innerWidth - 48;
		if (maxHeight < maxWidth) {
			spotifyHandler.dom.artwork.style.width = maxHeight + "px";
		}
		else {
			spotifyHandler.dom.artwork.style.width = maxWidth + "px";
		}
	},

	updateTimes: function(prog, dur) {
		spotifyHandler.dom.playbackTime.innerHTML = formatSeconds(prog);
		spotifyHandler.dom.durationTime.innerHTML = formatSeconds(dur);
	},

	refreshDevices: function() {
		if (!document.hidden) {
			spotifyHandler.api.getMyDevices(function(err, data) {
				if (err) {
					console.error(err);
					spotifyHandler.dom.deviceList.innerHTML = "";
				}
				else {
					var tempList = "";
					var tempListDis = "";
					for (var i = 0; i < data.devices.length; i++) {
						if (data.devices[i].is_active) {
							spotifyHandler.dom.listeningOn.innerHTML = stripTags(data.devices[i].name);
							spotifyHandler.dom.listeningOnIcon.innerHTML = getDeviceIcon(data.devices[i].type.toLowerCase());
							if (data.devices.length > 1) {
								spotifyHandler.dom.devicesButton.setAttribute("data-curdevice", stripTags(data.devices[i].name));
							}
							else {
								spotifyHandler.dom.devicesButton.setAttribute("data-curdevice", "");
							}
						}
						else {
							if (isValidSpotifyId(data.devices[i].id)) {
								tempList += '<li class="devicelist-item" onclick="spotifyHandler.transferPlayback(\''+data.devices[i].id+'\')"><span class="devicelist-icon material-icons">'+getDeviceIcon(data.devices[i].type.toLowerCase())+'</span><span class="devicelist-name">'+stripTags(data.devices[i].name)+'</span></li>';
							}
						}
						if (isValidSpotifyId(data.devices[i].id)) {
							tempListDis += '<li class="devicelist-item" onclick="spotifyHandler.startPlaySession(\''+data.devices[i].id+'\')"><span class="devicelist-icon material-icons">'+getDeviceIcon(data.devices[i].type.toLowerCase())+'</span><span class="devicelist-name">'+stripTags(data.devices[i].name)+'</span></li>';
						}
					}
					spotifyHandler.dom.deviceList.innerHTML = tempList;
					spotifyHandler.dom.discoverList.innerHTML = tempListDis;
					if (data.devices.length > 1) {
						spotifyHandler.dom.deviceListHolder.style.display = "block";
						spotifyHandler.dom.devicesButton.className = "material-icons bar-button dotted";
					}
					else {
						spotifyHandler.dom.deviceListHolder.style.display = "none";
						spotifyHandler.dom.devicesButton.className = "material-icons bar-button";
					}
					if (data.devices.length > 0) {
						spotifyHandler.dom.discoverSpinner.style.display = "none";
						spotifyHandler.dom.discoverListHolder.style.display = null;
					}
					else {
						spotifyHandler.dom.discoverSpinner.style.display = null;
						spotifyHandler.dom.discoverListHolder.style.display = "none";
					}
				}
			});
		}
	},

	setVolume: function(newVolume, volumebarOnly) {
		spotifyHandler.dom.volumebar.style.background = 'linear-gradient(to top, #1DB954 0%, #1DB954 '+newVolume+'%, #353942 '+newVolume+'%, #353942 100%)';
		if (spotifyHandler.dom.volumebar.value != newVolume && !spotifyHandler.changingVolume) {
			spotifyHandler.dom.volumebar.value = newVolume;
		}
		if (!volumebarOnly) {
			spotifyHandler.api.setVolume(newVolume, {});
			spotifyHandler.volumeCooldown = true;
			clearTimeout(spotifyHandler.volumeCooldownTimer);
			spotifyHandler.volumeCooldownTimer = setTimeout(function() {
				spotifyHandler.volumeCooldown = false;
			}, 5000);
		}
	},

	transferringPlayback: false,
	transferPlayback: function(deviceId) {
		if (!spotifyHandler.transferringPlayback) {
			spotifyHandler.transferringPlayback = true;
			spotifyHandler.api.transferMyPlayback([deviceId], {}, function(err, data) {
				if (err) {
					console.error(err);
					spotifyHandler.transferringPlayback = false;
				}
				else {
					setTimeout(function() {
						spotifyHandler.refreshDevices();
						spotifyHandler.transferringPlayback = false;
					}, 500);
				}
			});
		}
	},

	fetchingQueue: false,
	fillQueue: function(type, id) {
		spotifyHandler.refreshQueue();
	},

	refreshQueue: function() {
		if (spotifyHandler.fetchingQueue) return;
		spotifyHandler.fetchingQueue = true;
		spotifyHandler.dom.queueButton.disabled = true;
		spotifyHandler.api.getMyQueue(function(err, data) {
			spotifyHandler.fetchingQueue = false;
			spotifyHandler.dom.queueButton.disabled = false;
			if (err || !data) return;

			spotifyHandler.dom.queue.innerHTML = "";

			if (data.currently_playing) {
				spotifyHandler.dom.contextName.innerHTML = "Now Playing";
				var nowPlaying = spotifyHandler.createTrackItem(data.currently_playing, true, false, false);
				nowPlaying.classList.add("now-playing");
				spotifyHandler.dom.queue.appendChild(nowPlaying);
			}

			if (data.queue && data.queue.length > 0) {
				spotifyHandler.dom.queue.appendChild(spotifyHandler.createDividerItem("Up Next"));
				for (var i = 0; i < data.queue.length; i++) {
					if (data.queue[i]) {
						spotifyHandler.dom.queue.appendChild(spotifyHandler.createTrackItem(data.queue[i], true));
					}
				}
			}
		});
	},

	createTrackItem: function(tempTrack, doCover, showAddToQueue, clickable) {
		if (clickable === undefined) clickable = true;
		var trackElem = document.createElement("li");
		var tempArtists = [];
		trackElem.className = "queue-item";
		trackElem.setAttribute("data-uri", tempTrack.uri);
		if (clickable) {
			if (tempTrack.album) {
				trackElem.setAttribute("data-context", tempTrack.album.uri);
			}
			trackElem.setAttribute("onclick", "spotifyHandler.playContext(this.getAttribute('data-context'), this.getAttribute('data-uri'));");
		} else {
			trackElem.style.cursor = "default";
		}
		tempArtists = [];
		for (var j = 0; j < tempTrack.artists.length; j++) {
			tempArtists.push(stripTags(tempTrack.artists[j].name));
		}
		var addToQueueBtn = '';
		if (showAddToQueue && isValidSpotifyUri(tempTrack.uri)) {
			addToQueueBtn = '<button class="queue-add-btn material-icons" onclick="event.stopPropagation(); spotifyHandler.addToQueue(\''+tempTrack.uri+'\', this);" title="Add to queue">&#xe05f;</button>';
		}
		var imgUrl = (doCover && tempTrack.album && tempTrack.album.images.length > 0) ? sanitizeImageUrl(tempTrack.album.images.pop().url) : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
		trackElem.innerHTML = (doCover ? '<div class="queue-item-cover"><img src="'+imgUrl+'"></div>': '<div class="queue-item-cover"><span>'+(tempTrack.disc_number > 1 ? tempTrack.disc_number+'-' : '')+tempTrack.track_number+'</span></div>')+'<div class="queue-item-metadata"><div class="queue-item-name">'+stripTags(tempTrack.name)+'</div><div class="queue-item-artist">'+tempArtists.join(', ')+'</div></div>'+addToQueueBtn;
		return (trackElem);
	},

	addToQueue: function(uri, btnElement) {
		spotifyHandler.api.addToQueue(uri, {}, function(err) {
			if (!err) {
				btnElement.innerHTML = "&#xe876;"; // checkmark
				btnElement.disabled = true;
				setTimeout(function() {
					btnElement.innerHTML = "&#xe05f;"; // queue icon
					btnElement.disabled = false;
				}, 2000);
			}
		});
	},

	playContext: function(contextUri, trackUri) {
		if (trackUri == null) {
			spotifyHandler.api.play({
				context_uri: contextUri
			});
		}
		else if (contextUri != null && contextUri != "spotify:library:library") {
			spotifyHandler.api.play({
				context_uri: contextUri,
				offset: {
					uri: trackUri
				}
			});
		}
		else {
			// workaround for missing context for user's library
			// only plays tracks fetched so far... but it's better than nothing
			var tempUris = [];
			for (var i = 0; i < spotifyHandler.dom.queue.children.length; i++) {
				tempUris.push(spotifyHandler.dom.queue.children[i].getAttribute("data-uri"));
			}
			spotifyHandler.api.play({
				uris: tempUris,
				offset: {
					uri: trackUri
				}
			});
		}
		if (pageHandler.shown == "searchpage") {
			pageHandler.showPage("playerpage");
		}
	},

	enableAndPlayOnThisDevice: function() {
		localStorage.setItem("spotify_web_playback", "true");
		var checkbox = document.getElementById("enable-web-playback");
		if (checkbox) checkbox.checked = true;
		// Initialize the SDK and wait for it to connect
		spotifyHandler.initWebPlayer();
		// Show loading state
		var btn = document.getElementById("this-device-btn");
		btn.textContent = "Connecting...";
		btn.disabled = true;
	},

	startPlaySession: function(deviceId) {
		spotifyHandler.api.play({
			device_id: deviceId
		}, function(err, data) {
			if (err) {
				console.error(err);
				alert("Could not start playback due to an error ("+err.status+"). You'll have to start it yourself, on the device you clicked on.");
			}
		});
	},

	fetchingPlaylists: false,
	playlistsTotal: undefined,
	playlistsOffset: 0,
	firstAlbumFetched: false,
	loadLibrary: function() {
		spotifyHandler.dom.library.innerHTML = "";
		spotifyHandler.dom.library.appendChild(spotifyHandler.createDividerItem("Playlists"));
		spotifyHandler.playlistsOffset = 0;
		spotifyHandler.playlistsTotal = undefined;
		spotifyHandler.fetchPlaylists(0);
	},

	fetchPlaylists: function(offset) {
		if (spotifyHandler.fetchingPlaylists != true) {
			spotifyHandler.fetchingPlaylists = true;
			if (offset < spotifyHandler.playlistsTotal || (offset == 0 && spotifyHandler.playlistsTotal == undefined)) {
				spotifyHandler.api.getUserPlaylists({offset: offset, limit: 50}, spotifyHandler.handleFetchedPlaylists);
			}
			else {
				if (!spotifyHandler.firstAlbumFetched) {
					spotifyHandler.dom.library.appendChild(spotifyHandler.createDividerItem("Albums"));
					spotifyHandler.firstAlbumFetched = true;
				}
				offset = offset - spotifyHandler.playlistsTotal;
				if (offset >= 0) {
					spotifyHandler.api.getMySavedAlbums({offset: offset, limit: 50}, spotifyHandler.handleFetchedPlaylists);
				}
			}
		}
		else {
			console.warn("Already fetching playlists!");
		}
	},

	handleFetchedPlaylists: function(err, data) {
		spotifyHandler.fetchingPlaylists = false;
		if (err) {
			console.error(err);
		}
		else {
			spotifyHandler.addPlaylists(data.items);
			spotifyHandler.playlistsOffset += data.items.length;
			if (data.href.indexOf("me/albums") == -1) {
				spotifyHandler.playlistsTotal = data.total;
			}
			else if (data.offset == data.total) {
				// workaround to stop fetching albums from library once all have been fetched
				spotifyHandler.fetchingPlaylists = true;
			}
		}
	},

	createPlaylistOrAlbumItem: function(tempData) {
		var playlistElem = document.createElement("li");
		playlistElem.className = "queue-item";
		playlistElem.setAttribute("data-uri", tempData.uri);
		var tempArtists = [];
		if ("artists" in tempData) {
			for (var j = 0; j < tempData.artists.length; j++) {
				tempArtists.push(stripTags(tempData.artists[j].name));
			}
		}
		playlistElem.setAttribute("onclick", "spotifyHandler.playContext(this.getAttribute('data-uri'), null); pageHandler.showPage('playerpage');");
		var imgUrl = (tempData.images && tempData.images.length > 0) ? sanitizeImageUrl(tempData.images.pop().url) : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
		playlistElem.innerHTML = '<div class="queue-item-cover"><img src="'+imgUrl+'"></div><div class="queue-item-metadata"><div class="queue-item-name">'+stripTags(tempData.name)+'</div><div class="queue-item-artist">'+("artists" in tempData ? tempArtists.join(", ") : 'by '+stripTags(tempData.owner.display_name))+'</div></div>';
		return (playlistElem);
	},

	createArtistItem: function(artist) {
		var artistElem = document.createElement("li");
		artistElem.className = "queue-item";
		artistElem.setAttribute("data-uri", artist.uri);
		artistElem.setAttribute("onclick", "spotifyHandler.playContext(this.getAttribute('data-uri'), null);");
		var imgSrc = (artist.images && artist.images.length > 0) ? sanitizeImageUrl(artist.images[artist.images.length - 1].url) : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
		artistElem.innerHTML = '<div class="queue-item-cover"><img src="'+imgSrc+'"></div><div class="queue-item-metadata"><div class="queue-item-name">'+stripTags(artist.name)+'</div><div class="queue-item-artist">Artist</div></div>';
		return artistElem;
	},

	addPlaylists: function(data) {
		for (var i = 0; i < data.length; i++) {
			var tempData = data[i];
			if ("album" in tempData) {
				tempData = tempData.album;
			}
			spotifyHandler.dom.library.appendChild(spotifyHandler.createPlaylistOrAlbumItem(tempData));
		}
	},

	createDividerItem: function(content) {
		var divider = document.createElement("li");
		divider.className = "queue-item divider";
		divider.innerHTML = content;
		return (divider);
	},

	searchReq: null,
	searchDebounce: null,
	searchRetried: false,
	search: function(q) {
		if (spotifyHandler.searchReq != null) {
			spotifyHandler.searchReq.abort();
		}
		if (q.trim() != "")
		{
			spotifyHandler.searchReq = spotifyHandler.api.search(q.trim(), ["track", "artist", "album", "playlist"], {offset: 0, limit: 10});
			spotifyHandler.searchReq.then(function(data) {
				spotifyHandler.searchRetried = false;
				spotifyHandler.dom.search.innerHTML = "";
				var anyResults = false;
				// Determine result order based on relevance
				var query = q.trim().toLowerCase();
				var artistMatchesQuery = data.artists.items.length > 0 && data.artists.items[0] &&
					data.artists.items[0].name.toLowerCase().indexOf(query) !== -1;

				var sections = [];
				if (data.artists.items.length > 0) {
					sections.push({type: "artists", label: "Artists", priority: artistMatchesQuery ? 0 : 2});
				}
				if (data.tracks.items.length > 0) {
					sections.push({type: "tracks", label: "Tracks", priority: artistMatchesQuery ? 1 : 0});
				}
				if (data.albums.items.length > 0) {
					sections.push({type: "albums", label: "Albums", priority: 3});
				}
				if (data.playlists.items.length > 0) {
					sections.push({type: "playlists", label: "Playlists", priority: 4});
				}
				sections.sort(function(a, b) { return a.priority - b.priority; });

				for (var s = 0; s < sections.length; s++) {
					var section = sections[s];
					spotifyHandler.dom.search.appendChild(spotifyHandler.createDividerItem(section.label));
					var items = data[section.type].items;
					for (var i = 0; i < items.length; i++) {
						if (!items[i]) continue;
						if (section.type === "tracks") {
							spotifyHandler.dom.search.appendChild(spotifyHandler.createTrackItem(items[i], true, true));
						} else if (section.type === "artists") {
							spotifyHandler.dom.search.appendChild(spotifyHandler.createArtistItem(items[i]));
						} else {
							spotifyHandler.dom.search.appendChild(spotifyHandler.createPlaylistOrAlbumItem(items[i], true));
						}
					}
					anyResults = true;
				}
				if (!anyResults) {
					spotifyHandler.dom.search.appendChild(spotifyHandler.createDividerItem("No results found for \""+stripTags(q.trim())+"\""));
				}
			}, function(err) {
				// Retry once on server errors (502, 503)
				if (err && err.status >= 500 && !spotifyHandler.searchRetried) {
					spotifyHandler.searchRetried = true;
					setTimeout(function() {
						spotifyHandler.search(q);
					}, 1000);
				}
			});
		}
		else {
			spotifyHandler.dom.search.innerHTML = "";
		}
	},

	init: function() {
		document.getElementById("signinbtn").addEventListener("click", spotifyHandler.signIn);

		spotifyHandler.dom.playerPage = document.getElementById("playerpage");
		spotifyHandler.dom.playingFrom = document.getElementById("playing-from");
		spotifyHandler.dom.playingFromName = document.getElementById("playing-from-name");
		spotifyHandler.dom.artwork = document.getElementById("artwork");
		spotifyHandler.dom.title = document.getElementById("title");
		spotifyHandler.dom.artist = document.getElementById("artist");
		spotifyHandler.dom.likeButton = document.getElementById("like-button");
		spotifyHandler.dom.playbackTime = document.getElementById("playback-time");
		spotifyHandler.dom.durationTime = document.getElementById("duration-time");
		spotifyHandler.dom.shuffleButton = document.getElementById("shuffle-button");
		spotifyHandler.dom.previousButton = document.getElementById("previous-button");
		spotifyHandler.dom.playPauseButton = document.getElementById("play-pause-button");
		spotifyHandler.dom.nextButton = document.getElementById("next-button");
		spotifyHandler.dom.repeatButton = document.getElementById("repeat-button");
		spotifyHandler.dom.devicesButton = document.getElementById("devices-button");
		spotifyHandler.dom.queuePage = document.getElementById("queuepage");
		spotifyHandler.dom.queueButton = document.getElementById("queue-button");
		spotifyHandler.dom.queue = document.getElementById("queue");
		spotifyHandler.dom.contextName = document.getElementById("contextname");
		spotifyHandler.dom.deviceListHolder = document.getElementById("devicelist-holder");
		spotifyHandler.dom.deviceList = document.getElementById("devicelist");
		spotifyHandler.dom.discoverSpinner = document.getElementById("discoverspinner");
		spotifyHandler.dom.discoverListHolder = document.getElementById("discoverlist-holder");
		spotifyHandler.dom.discoverList = document.getElementById("discoverlist");
		spotifyHandler.dom.volumebar = document.getElementById("volumebar");
		spotifyHandler.dom.listeningOn = document.getElementById("listeningon");
		spotifyHandler.dom.listeningOnIcon = document.getElementById("listeningon-icon");
		spotifyHandler.dom.themeColor = document.querySelector("meta[name=theme-color]");
		spotifyHandler.dom.library = document.getElementById("library");
		spotifyHandler.dom.libraryPage = document.getElementById("librarypage");
		spotifyHandler.dom.search = document.getElementById("search");
		spotifyHandler.dom.searchPage = document.getElementById("searchpage");
		spotifyHandler.dom.searchBar = document.getElementById("searchbar");

		// Settings
		var deviceNameInput = document.getElementById("device-name-input");
		var deviceNameSave = document.getElementById("device-name-save");
		var settingsCommit = document.getElementById("settings-commit");
		deviceNameInput.value = localStorage.getItem("spotify_device_name") || 'Spotify Web Controller';
		settingsCommit.textContent = spotifyHandler.buildCommit;
		deviceNameSave.addEventListener("click", function() {
			var newName = deviceNameInput.value.trim();
			if (newName) {
				localStorage.setItem("spotify_device_name", newName);
				if (spotifyHandler.webPlayer) {
					spotifyHandler.webPlayer.setName(newName);
				}
				deviceNameSave.textContent = "Saved!";
				setTimeout(function() { deviceNameSave.textContent = "Save"; }, 1500);
			}
		});

		// Capability checks
		spotifyHandler.runCapabilityChecks();

		// Web playback toggle
		var webPlaybackCheckbox = document.getElementById("enable-web-playback");
		var deviceNameSection = document.getElementById("device-name-section");
		webPlaybackCheckbox.checked = localStorage.getItem("spotify_web_playback") === "true";
		deviceNameSection.style.display = webPlaybackCheckbox.checked ? "block" : "none";
		webPlaybackCheckbox.addEventListener("change", function() {
			localStorage.setItem("spotify_web_playback", webPlaybackCheckbox.checked);
			deviceNameSection.style.display = webPlaybackCheckbox.checked ? "block" : "none";
			if (!webPlaybackCheckbox.checked && spotifyHandler.webPlayer) {
				spotifyHandler.webPlayer.disconnect();
				spotifyHandler.webPlayerDeviceId = null;
			} else if (webPlaybackCheckbox.checked && !spotifyHandler.webPlayer) {
				spotifyHandler.initWebPlayer();
			}
		});

		window.addEventListener("resize", spotifyHandler.fixArtSize);
		spotifyHandler.dom.artwork.addEventListener("loadstart", function(event) {
			spotifyHandler.dom.playerPage.style.background = null;
			spotifyHandler.dom.themeColor.setAttribute("content", "#1DB954");
		});
		spotifyHandler.dom.artwork.addEventListener("load", function(event) {
			spotifyHandler.fixArtSize();
			if (event.target.src.indexOf("data:image/gif;base64") != 0) {
				var vibrant = new Vibrant(event.target);
				var swatches = vibrant.swatches();
				if (swatches.Vibrant != undefined) {
					spotifyHandler.dom.playerPage.style.background = "linear-gradient(rgba("+swatches.Vibrant.rgb.join(",")+",0.7), #15161A 75%)";
					spotifyHandler.dom.themeColor.setAttribute("content", swatches.Vibrant.getHex());
				}
				else if (swatches.Muted != undefined) {
					spotifyHandler.dom.playerPage.style.background = "linear-gradient(rgba("+swatches.Muted.rgb.join(",")+",0.7), #15161A 75%)";
					spotifyHandler.dom.themeColor.setAttribute("content", swatches.Muted.getHex());
				}
				else {
					spotifyHandler.dom.playerPage.style.background = null;
					spotifyHandler.dom.themeColor.setAttribute("content", "#1DB954");
				}
			}
			else {
				spotifyHandler.dom.playerPage.style.background = null;
				spotifyHandler.dom.themeColor.setAttribute("content", "#1DB954");
			}
		});
		spotifyHandler.dom.playPauseButton.addEventListener("click", function(event) {
			spotifyHandler.dom.playPauseButton.disabled = true;
			if (spotifyHandler.dom.playPauseButton.title == "Pause") {
				spotifyHandler.api.pause({}, function() {
					spotifyHandler.dom.playPauseButton.disabled = false;
					spotifyHandler.dom.playPauseButton.innerHTML = "&#xe038;";
					spotifyHandler.dom.playPauseButton.title = "Play";
					setTimeout(function() {
						spotifyHandler.setCurrentlyPlaying();
					}, 250);
				});
			}
			else {
				spotifyHandler.api.play({}, function() {
					spotifyHandler.dom.playPauseButton.disabled = false;
					spotifyHandler.dom.playPauseButton.innerHTML = "&#xe035;";
					spotifyHandler.dom.playPauseButton.title = "Pause";
					setTimeout(function() {
						spotifyHandler.setCurrentlyPlaying();
					}, 250);
				});
			}
		});
		spotifyHandler.dom.nextButton.addEventListener("click", function(event) {
			spotifyHandler.dom.nextButton.disabled = true;
			spotifyHandler.api.skipToNext({}, function() {
				spotifyHandler.dom.nextButton.disabled = false;
				setTimeout(function() {
					spotifyHandler.setCurrentlyPlaying();
				}, 250);
			});
		});
		spotifyHandler.dom.previousButton.addEventListener("click", function(event) {
			spotifyHandler.dom.previousButton.disabled = true;
			spotifyHandler.api.skipToPrevious({}, function() {
				spotifyHandler.dom.previousButton.disabled = false;
				setTimeout(function() {
					spotifyHandler.setCurrentlyPlaying();
				}, 250);
			});
		});
		spotifyHandler.dom.likeButton.addEventListener("click", function(event) {
			spotifyHandler.dom.likeButton.disabled = true;
			if (spotifyHandler.dom.likeButton.getAttribute("data-liked") == "false") {
				spotifyHandler.api.addToMySavedTracks([spotifyHandler.lastTrackId], {}, function(err, data) {
					spotifyHandler.dom.likeButton.disabled = false;
					if (!err) {
						spotifyHandler.dom.likeButton.innerHTML = "&#xe87d;";
						spotifyHandler.dom.likeButton.style.color = "#1DB954";
						spotifyHandler.dom.likeButton.title = "Remove from liked songs";
						spotifyHandler.dom.likeButton.setAttribute("data-liked", "true");
					}
				});
			}
			else {
				spotifyHandler.api.removeFromMySavedTracks([spotifyHandler.lastTrackId], {}, function(err, data) {
					spotifyHandler.dom.likeButton.disabled = false;
					if (!err) {
						spotifyHandler.dom.likeButton.innerHTML = "&#xe87e;";
						spotifyHandler.dom.likeButton.style.color = null;
						spotifyHandler.dom.likeButton.title = "Add to liked songs";
						spotifyHandler.dom.likeButton.setAttribute("data-liked", "false");
					}
				});
			}
		});
		spotifyHandler.dom.devicesButton.addEventListener("click", function(event) {
			pageHandler.showPage("devicespage");
		});
		spotifyHandler.dom.queueButton.addEventListener("click", function(event) {
			spotifyHandler.refreshQueue();
			pageHandler.showPage("queuepage");
		});
		spotifyHandler.dom.shuffleButton.addEventListener("click", function(event) {
			spotifyHandler.dom.shuffleButton.disabled = true;
			spotifyHandler.api.setShuffle(!spotifyHandler.lastPlaybackStatus.shuffle_state, {}, function(err, data) {
				spotifyHandler.dom.shuffleButton.disabled = false;
				if (err) {
					console.error(err);
				}
				else {
					setTimeout(function() {
						spotifyHandler.setCurrentlyPlaying();
					}, 250);
				}
			});
		});
		spotifyHandler.dom.repeatButton.addEventListener("click", function(event) {
			spotifyHandler.dom.repeatButton.disabled = true;
			var newState = {
				off: "context",
				context: "track",
				track: "off"
			};
			spotifyHandler.api.setRepeat(newState[spotifyHandler.lastPlaybackStatus.repeat_state], {}, function(err, data) {
				spotifyHandler.dom.repeatButton.disabled = false;
				if (err) {
					console.error(err);
				}
				else {
					setTimeout(function() {
						spotifyHandler.setCurrentlyPlaying();
					}, 250);
				}
			});
		});

		spotifyHandler.dom.libraryPage.addEventListener("scroll", function(event) {
			if (event.target.offsetHeight + event.target.scrollTop + 1280 >= event.target.scrollHeight && spotifyHandler.fetchingPlaylists != true) {
				spotifyHandler.fetchPlaylists(spotifyHandler.playlistsOffset);
			}
		});

		spotifyHandler.dom.searchBar.addEventListener("input", function(event) {
			var value = event.target.value;
			clearTimeout(spotifyHandler.searchDebounce);
			spotifyHandler.searchDebounce = setTimeout(function() {
				spotifyHandler.search(value);
			}, 300);
		});

		if ('mediaSession' in navigator)
		{
			navigator.mediaSession.metadata = new MediaMetadata({});
			navigator.mediaSession.setActionHandler('play', spotifyHandler.api.play);
			navigator.mediaSession.setActionHandler('pause', spotifyHandler.api.pause);
			navigator.mediaSession.setActionHandler('nexttrack', spotifyHandler.api.skipToNext);
			navigator.mediaSession.setActionHandler('previoustrack', spotifyHandler.api.skipToPrevious);
			navigator.mediaSession.playbackState = "none";
		}

		var urlParams = new URLSearchParams(window.location.search);
		var code = urlParams.get("code");
		var urlState = urlParams.get("state");
		var urlError = urlParams.get("error");

		if (code && urlState === state) {
			// Clean the URL
			window.history.replaceState({}, document.title, window.location.pathname);
			// Exchange authorization code for access token
			spotifyHandler.exchangeCodeForToken(code, function(err, data) {
				if (err) {
					alert("An error occurred exchanging the authorization code: " + err);
					pageHandler.showPage("signinpage");
					return;
				}
				setCookie("spat", data.access_token);
				spotifyHandler.expires = new Date().getTime() + (parseInt(data.expires_in) * 1000);
				setCookie("spex", spotifyHandler.expires);
				if (data.refresh_token) {
					setCookie("sprt", data.refresh_token);
				}
				spotifyHandler.api.setAccessToken(data.access_token);
				deleteCookie("spst");
				spotifyHandler.startPlayback();
			});
		}
		else if (urlError && urlState === state) {
			if (urlError != "access_denied") {
				alert("An error occurred connecting to your Spotify account: " + urlError);
			}
			pageHandler.showPage("signinpage");
		}
		else if (getCookie("spat") != null && getCookie("spex") != null) {
			spotifyHandler.expires = parseInt(getCookie("spex"));
			if (new Date().getTime() < spotifyHandler.expires) {
				spotifyHandler.api.setAccessToken(getCookie("spat"));
				spotifyHandler.startPlayback();
			} else if (getCookie("sprt") != null) {
				// Token expired but we have a refresh token
				spotifyHandler.refreshAccessToken(function(success) {
					if (success) {
						spotifyHandler.startPlayback();
					} else {
						pageHandler.showPage("signinpage");
					}
				});
			} else {
				pageHandler.showPage("signinpage");
			}
		}
		else {
			pageHandler.showPage('signinpage');
		}
	},

	startPlayback: function() {
		setInterval(spotifyHandler.checkAccessToken, 30000);
		setInterval(spotifyHandler.refreshDevices, 10000);
		setInterval(spotifyHandler.setCurrentlyPlaying, 5000);
		setTimeout(function() {
			setInterval(function() {
				if (spotifyHandler.lastPlaybackStatus.is_playing && !progressBar.hovering) {
					spotifyHandler.progress += 1;
					var progressPerc = (spotifyHandler.progress / spotifyHandler.duration) * 100;
					progressBar.setValue(progressPerc);
					spotifyHandler.updateTimes(spotifyHandler.progress, spotifyHandler.duration);
				}
			}, 1000);
		}, 500);
		// If web playback is disabled or SDK hasn't connected after 5 seconds, show discover page
		if (localStorage.getItem("spotify_web_playback") !== "true") {
			spotifyHandler.webPlayerActivated = true;
			pageHandler.showPage("discoverpage");
		} else {
			setTimeout(function() {
				if (!spotifyHandler.webPlayerDeviceId && !spotifyHandler.webPlayerActivated) {
					spotifyHandler.webPlayerActivated = true;
					if (pageHandler.shown == "playerpage" && spotifyHandler.lastTrackId == "null2") {
						pageHandler.showPage("discoverpage");
					}
				}
			}, 5000);
		}
		pageHandler.showPage("playerpage");
		spotifyHandler.setCurrentlyPlaying();
		spotifyHandler.refreshDevices();
		spotifyHandler.loadLibrary();
		spotifyHandler.initWebPlayer();
	},

	runCapabilityChecks: function() {
		var sdkDisabled = localStorage.getItem("spotify_web_playback") !== "true";
		var checks = [
			{ id: "cap-secure-context", pass: window.isSecureContext },
			{ id: "cap-web-crypto", pass: !!(window.crypto && window.crypto.subtle) },
			{ id: "cap-eme", pass: !!(navigator.requestMediaKeySystemAccess) },
			{ id: "cap-sdk-connected", pass: !!spotifyHandler.webPlayerDeviceId, disabled: sdkDisabled }
		];
		checks.forEach(function(check) {
			var el = document.getElementById(check.id);
			if (check.disabled) {
				el.classList.remove("cap-pass");
				el.classList.remove("cap-fail");
				el.style.color = "#666";
				el.querySelector(".cap-icon").innerHTML = "&#xe15b;"; // remove circle
				el.innerHTML = el.innerHTML.replace(/(connected).*$/, '$1 (disabled)');
			} else if (check.pass) {
				el.classList.add("cap-pass");
				el.classList.remove("cap-fail");
				el.querySelector(".cap-icon").innerHTML = "&#xe86c;"; // check circle
			} else {
				el.classList.add("cap-fail");
				el.classList.remove("cap-pass");
				el.querySelector(".cap-icon").innerHTML = "&#xe000;"; // error
			}
		});
		// Re-check SDK connection after a delay (it may connect later)
		if (!spotifyHandler.webPlayerDeviceId && !sdkDisabled) {
			setTimeout(function() {
				var el = document.getElementById("cap-sdk-connected");
				if (spotifyHandler.webPlayerDeviceId) {
					el.classList.add("cap-pass");
					el.classList.remove("cap-fail");
					el.querySelector(".cap-icon").innerHTML = "&#xe86c;";
				}
			}, 5000);
		}
	},

	initWebPlayer: function() {
		if (localStorage.getItem("spotify_web_playback") !== "true") {
			return;
		}
		if (window.Spotify && window.Spotify.Player) {
			spotifyHandler.createWebPlayer();
		} else {
			// SDK hasn't loaded yet or hasn't initialized Player
			window.onSpotifyWebPlaybackSDKReady = function() {
				spotifyHandler.createWebPlayer();
			};
		}
	},

	createWebPlayer: function() {
		var player = new Spotify.Player({
			name: localStorage.getItem("spotify_device_name") || 'Spotify Web Controller',
			getOAuthToken: function(cb) {
				// If token is still valid, use it; otherwise refresh first
				if (new Date().getTime() < spotifyHandler.expires) {
					cb(getCookie("spat"));
				} else {
					spotifyHandler.refreshAccessToken(function(success) {
						cb(getCookie("spat"));
					});
				}
			},
			volume: 0.5
		});

		player.addListener('ready', function(data) {
			spotifyHandler.webPlayerDeviceId = data.device_id;
			// Transfer playback to this device
			if (!spotifyHandler.webPlayerActivated) {
				spotifyHandler.webPlayerActivated = true;
				spotifyHandler.api.transferMyPlayback([data.device_id], {play: false}, function(err) {
					if (!err) {
						pageHandler.showPage("playerpage");
					}
				});
			} else if (pageHandler.shown == "discoverpage") {
				// Enabled from discover page
				spotifyHandler.api.transferMyPlayback([data.device_id], {play: false}, function(err) {
					if (!err) {
						pageHandler.showPage("playerpage");
					}
				});
			}
			// Refresh device list so the web player shows up
			setTimeout(function() {
				spotifyHandler.refreshDevices();
			}, 1000);
		});

		player.addListener('not_ready', function(data) {
			spotifyHandler.webPlayerDeviceId = null;
			// Try to reconnect after a delay
			setTimeout(function() {
				if (spotifyHandler.webPlayer) {
					spotifyHandler.webPlayer.connect();
				}
			}, 5000);
		});

		player.addListener('player_state_changed', function(state) {
			if (state) {
				spotifyHandler.setCurrentlyPlaying();
			}
		});

		player.addListener('initialization_error', function(e) {
			console.error('Web Playback SDK initialization error:', e.message);
		});

		player.addListener('authentication_error', function(e) {
			console.error('Web Playback SDK authentication error:', e.message);
		});

		player.addListener('account_error', function(e) {
			console.error('Web Playback SDK account error (Premium required):', e.message);
		});

		player.connect();
		spotifyHandler.webPlayer = player;
	}
};