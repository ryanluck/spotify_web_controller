/*
 * Stripped version of JMPerez/spotify-web-api-js
 * https://github.com/JMPerez/spotify-web-api-js/
 * Only includes methods used by this application.
 */

'use strict';

var SpotifyWebApi = (function() {
  var _baseUri = 'https://api.spotify.com/v1';
  var _accessToken = null;

  var WrapPromiseWithAbort = function(promise, onAbort) {
    promise.abort = onAbort;
    return promise;
  };

  var _promiseProvider = function(promiseFunction, onAbort) {
    if (window.Promise) {
      var returnedPromise = new window.Promise(promiseFunction);
      return new WrapPromiseWithAbort(returnedPromise, onAbort);
    }
    return null;
  };

  var _extend = function() {
    var args = Array.prototype.slice.call(arguments);
    var target = args[0] || {};
    var objects = args.slice(1);
    objects.forEach(function(object) {
      for (var j in object) {
        if (object.hasOwnProperty(j)) {
          target[j] = object[j];
        }
      }
    });
    return target;
  };

  var _buildUrl = function(url, parameters) {
    var qs = '';
    for (var key in parameters) {
      if (parameters.hasOwnProperty(key)) {
        qs += encodeURIComponent(key) + '=' + encodeURIComponent(parameters[key]) + '&';
      }
    }
    if (qs.length > 0) {
      url = url + '?' + qs.substring(0, qs.length - 1);
    }
    return url;
  };

  var _performRequest = function(requestData, callback) {
    var req = new XMLHttpRequest();

    var promiseFunction = function(resolve, reject) {
      function success(data) {
        if (resolve) resolve(data);
        if (callback) callback(null, data);
      }

      function failure() {
        if (reject) reject(req);
        if (callback) callback(req, null);
      }

      var type = requestData.type || 'GET';
      req.open(type, _buildUrl(requestData.url, requestData.params));
      if (_accessToken) {
        req.setRequestHeader('Authorization', 'Bearer ' + _accessToken);
      }
      if (requestData.contentType) {
        req.setRequestHeader('Content-Type', requestData.contentType);
      }

      req.onreadystatechange = function() {
        if (req.readyState === 4) {
          var data = null;
          try {
            data = req.responseText ? JSON.parse(req.responseText) : '';
          } catch (e) {
            data = '';
          }
          if (req.status >= 200 && req.status < 300) {
            success(data);
          } else {
            failure();
          }
        }
      };

      if (type === 'GET') {
        req.send(null);
      } else {
        req.send(requestData.postData ? JSON.stringify(requestData.postData) : null);
      }
    };

    if (callback) {
      promiseFunction();
      return null;
    } else {
      return _promiseProvider(promiseFunction, function() { req.abort(); });
    }
  };

  var _checkParamsAndPerformRequest = function(requestData, options, callback) {
    var opt = {};
    var cb = null;

    if (typeof options === 'object') {
      opt = options;
      cb = callback;
    } else if (typeof options === 'function') {
      cb = options;
    }

    var type = requestData.type || 'GET';
    if (type !== 'GET' && requestData.postData) {
      requestData.postData = _extend(requestData.postData, opt);
    } else {
      requestData.params = _extend(requestData.params, opt);
    }
    return _performRequest(requestData, cb);
  };

  var Constr = function() {};
  Constr.prototype = { constructor: SpotifyWebApi };

  Constr.prototype.setAccessToken = function(token) {
    _accessToken = token;
  };

  Constr.prototype.getMyCurrentPlaybackState = function(options, callback) {
    return _checkParamsAndPerformRequest({ url: _baseUri + '/me/player' }, options, callback);
  };

  Constr.prototype.getMyDevices = function(callback) {
    return _checkParamsAndPerformRequest({ url: _baseUri + '/me/player/devices' }, callback);
  };

  Constr.prototype.getMyQueue = function(callback) {
    return _checkParamsAndPerformRequest({ url: _baseUri + '/me/player/queue' }, callback);
  };

  Constr.prototype.addToQueue = function(uri, options, callback) {
    return _checkParamsAndPerformRequest({ type: 'POST', url: _baseUri + '/me/player/queue', params: { uri: uri } }, options, callback);
  };

  Constr.prototype.play = function(options, callback) {
    var params = {};
    var postData = {};
    if (options) {
      if ('device_id' in options) { params.device_id = options.device_id; delete options.device_id; }
      if ('context_uri' in options) { postData.context_uri = options.context_uri; }
      if ('uris' in options) { postData.uris = options.uris; }
      if ('offset' in options) { postData.offset = options.offset; }
    }
    return _checkParamsAndPerformRequest({ type: 'PUT', url: _baseUri + '/me/player/play', params: params, postData: Object.keys(postData).length > 0 ? postData : null }, {}, callback);
  };

  Constr.prototype.pause = function(options, callback) {
    var params = (options && 'device_id' in options) ? { device_id: options.device_id } : null;
    return _checkParamsAndPerformRequest({ type: 'PUT', url: _baseUri + '/me/player/pause', params: params }, options, callback);
  };

  Constr.prototype.seek = function(positionMs, options, callback) {
    var params = { position_ms: positionMs };
    if (options && 'device_id' in options) { params.device_id = options.device_id; }
    return _checkParamsAndPerformRequest({ type: 'PUT', url: _baseUri + '/me/player/seek', params: params }, options, callback);
  };

  Constr.prototype.skipToNext = function(options, callback) {
    options = options || {};
    var params = 'device_id' in options ? { device_id: options.device_id } : null;
    return _checkParamsAndPerformRequest({ type: 'POST', url: _baseUri + '/me/player/next', params: params }, options, callback);
  };

  Constr.prototype.skipToPrevious = function(options, callback) {
    options = options || {};
    var params = 'device_id' in options ? { device_id: options.device_id } : null;
    return _checkParamsAndPerformRequest({ type: 'POST', url: _baseUri + '/me/player/previous', params: params }, options, callback);
  };

  Constr.prototype.setVolume = function(volume, options, callback) {
    var params = { volume_percent: volume };
    if (options && 'device_id' in options) { params.device_id = options.device_id; }
    return _checkParamsAndPerformRequest({ type: 'PUT', url: _baseUri + '/me/player/volume', params: params }, options, callback);
  };

  Constr.prototype.setShuffle = function(state, options, callback) {
    var params = { state: state };
    if (options && 'device_id' in options) { params.device_id = options.device_id; }
    return _checkParamsAndPerformRequest({ type: 'PUT', url: _baseUri + '/me/player/shuffle', params: params }, options, callback);
  };

  Constr.prototype.setRepeat = function(state, options, callback) {
    var params = { state: state };
    if (options && 'device_id' in options) { params.device_id = options.device_id; }
    return _checkParamsAndPerformRequest({ type: 'PUT', url: _baseUri + '/me/player/repeat', params: params }, options, callback);
  };

  Constr.prototype.transferMyPlayback = function(deviceIds, options, callback) {
    var postData = options || {};
    postData.device_ids = deviceIds;
    return _checkParamsAndPerformRequest({ type: 'PUT', url: _baseUri + '/me/player', postData: postData }, {}, callback);
  };

  Constr.prototype.getPlaylist = function(playlistId, options, callback) {
    return _checkParamsAndPerformRequest({ url: _baseUri + '/playlists/' + playlistId }, options, callback);
  };

  Constr.prototype.getAlbum = function(albumId, options, callback) {
    return _checkParamsAndPerformRequest({ url: _baseUri + '/albums/' + albumId }, options, callback);
  };

  Constr.prototype.getArtist = function(artistId, options, callback) {
    return _checkParamsAndPerformRequest({ url: _baseUri + '/artists/' + artistId }, options, callback);
  };

  Constr.prototype.getUserPlaylists = function(options, callback) {
    return _checkParamsAndPerformRequest({ url: _baseUri + '/me/playlists' }, options, callback);
  };

  Constr.prototype.getMySavedAlbums = function(options, callback) {
    return _checkParamsAndPerformRequest({ url: _baseUri + '/me/albums' }, options, callback);
  };

  Constr.prototype.getMySavedTracks = function(options, callback) {
    return _checkParamsAndPerformRequest({ url: _baseUri + '/me/tracks' }, options, callback);
  };

  Constr.prototype.addToMySavedTracks = function(trackIds, options, callback) {
    return _checkParamsAndPerformRequest({ url: _baseUri + '/me/tracks', type: 'PUT', postData: trackIds }, options, callback);
  };

  Constr.prototype.removeFromMySavedTracks = function(trackIds, options, callback) {
    return _checkParamsAndPerformRequest({ url: _baseUri + '/me/tracks', type: 'DELETE', postData: trackIds }, options, callback);
  };

  Constr.prototype.containsMySavedTracks = function(trackIds, options, callback) {
    return _checkParamsAndPerformRequest({ url: _baseUri + '/me/tracks/contains', params: { ids: trackIds.join(',') } }, options, callback);
  };

  Constr.prototype.search = function(query, types, options, callback) {
    return _checkParamsAndPerformRequest({ url: _baseUri + '/search', params: { q: query, type: types.join(',') } }, options, callback);
  };

  return Constr;
})();
