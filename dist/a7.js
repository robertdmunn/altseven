var a7 = ( function() {
	"use strict";

	return {
		// initialization 
		// 1. sets console and templating options
		// 2. initializes user object
		// 3. checks user auth state
		// 4. renders initial layout
		init : function( options, initResolve, initReject ){
			var pr, p0, p1, p2;

			options.model = ( options.model !== undefined ? options.model : ( typeof gadgetui === 'object' ? "gadgetui" : "" ) );
			if( options.model === "" ){
				// model required
				initReject( "No model specified." );
			}
			
			pr = new Promise( function( resolve, reject ){
				a7.Log.trace( "a7 - model init" );
				a7.Model.init( options, resolve, reject );
			});

			pr
			.then( function(){
				a7.Model.set( "a7", {
					auth: {
						sessionTimeout : ( options.auth.sessionTimeout || ( 60 * 15 * 1000 ) )
					},					
					console : { 
						enabled : ( options.console.enabled || false ),
						wsServer : ( options.console.wsServer || "" ),
						top : ( options.console.top || 0 ),
						right : ( options.console.right || 0 )
					},
					logging : {
						logLevel: ( options.logging.logLevel || "ERROR,FATAL,INFO" )
					},
					model : options.model,
					remote: {	
						// modules: ( options.remote.modules | undefined ) // don't set into Model since they are being registered in Remote
						loginURL : ( options.remote.loginURL || "" ),
						refreshURL : ( options.remote.refreshURL || "" ),
						useTokens : ( options.auth.useTokens || true )
					},
					UI: {
						renderer : ( typeof Mustache === 'object' ? "Mustache" : ( typeof Handlebars === 'object' ? "Handlebars" : "" ) ),
						templates : ( options.UI.templates || undefined )
					},
					ready : false,
					user : ""
				});
			})
			
			.then( function(){
				p0 = new Promise( function( resolve, reject ){
					if( a7.Model.get( "a7.console.enabled" ) ){
						a7.Log.trace( "a7 - console init" );
						a7.Console.init( resolve, reject );
					}else{
						resolve();
					}
				});

				p0
				.then( function(){
					a7.Log.trace( "a7 - log init" );
					a7.Log.init();
				})
				.then( function(){
					a7.Log.trace( "a7 - security init" );
					// init user state
					a7.Security.init();					
				})
				.then( function(){
					a7.Log.trace( "a7 - remote init" );
					a7.Remote.init( options.remote.modules );					
				})
				.then( function(){
					a7.Log.trace( "a7 - events init" );
					a7.Events.init();					
				})
				.then( function(){
					p1 = new Promise( function( resolve, reject ){
						a7.Log.trace( "a7 - layout init" );
						// initialize templating engine
						a7.UI.init( resolve, reject );					
					});

					p1.then( function(){
						p2 = new Promise( function( resolve, reject ){
							a7.Log.trace( "a7 - isSecured" );
							// check whether user is authenticated
							a7.Security.isAuthenticated( resolve, reject );
						});

						p2.then( function( secure ){
							a7.Log.info( "Authenticated: " + secure + "..." );
							a7.Log.info( "Init complete..." );
							//a7.run( secure );
							initResolve();
						});

						p2['catch']( function( message ){
							a7.Log.error( message );
							initReject();
						});					
					});					
				});

				p0['catch']( function( message ){
					a7.Log.error( message );
					initReject();
				});
			});

			pr['catch']( function( message ){
				a7.Log.error( message );
				initReject();
			});
		}
	/*	,

		deinit: function(){
			// return state to default
			a7.Model.set( "a7.user", "" );
			//a7.Model.set( "a7.token", "" );
			sessionStorage.removeItem( "user" );
			sessionStorage.removeItem( "token" );
		}	*/
	};
}());

a7.Console = ( function() {
	"use strict";

	var title = "Console Window", 
		// width of window relative to it's container ( i.e. browser window )
		width = "50%",
		// the div we'll create to host the console content
		consoleDiv,
		// flag whether console is running
		active = false,
		_addMessage = function( message, dt, source, level ) {
			var div = document.createElement( "div" );
			div.setAttribute( "class", "a7-console-row-" + source );
			if( level !== undefined ){
				div.innerHTML = level + ": ";
				div.setAttribute( "class", div.getAttribute( "class" ) +  " a7-console-row-" + level );
			}
			div.innerHTML += +( dt.getHours() < 10 ? '0' + dt.getHours() : dt.getHours() ) + ':' + ( dt.getMinutes() < 10 ? '0' + dt.getMinutes() : dt.getMinutes() ) + ': ' + message;
			consoleDiv.appendChild( div );
		};

	return {
		init : function( resolve, reject ) {
			var console = a7.Model.get( "a7.console" );

			// check for console state
			if ( console.enabled ) {
				active = true;
				consoleDiv = document.createElement( "div" );
				consoleDiv.setAttribute( "id", "consoleDiv" );
				consoleDiv.setAttribute( "class", "a7-console" );
				document.body.append( consoleDiv );
				var connection,
					fp = new gadgetui.display.FloatingPane( consoleDiv, {
						width : width,
						title : title,
						opacity : 0.7,
						position : "absolute",
						right : console.right,
						top : console.top
					} );

				fp.selector.setAttribute( "right", 0 );

				window.WebSocket = window.WebSocket || window.MozWebSocket;

				// if browser doesn't support WebSocket, just show some
				// notification and exit
				if ( !window.WebSocket ) {
					consoleDiv.innerHTML( "Your browser doesn't support WebSockets." );
					return;
				}

				// open connection
				connection = new WebSocket( console.wsServer );

				connection.onopen = function() {
					//a7.Log.info( "Console initializing..." );
				};

				connection.onerror = function( error ) {
					var message =  "Can't connect to the console socket server.";
					if ( console.enabled ) {
						// just in there were some problems with conenction...
						_addMessage( message, new Date(), "local" );
					}else{
						a7.Log.error( message );
					}
					
				};

				// most important part - incoming messages
				connection.onmessage = function( message ) {
					var json, ix;
					// try to parse JSON message. Because we know that the
					// server always returns
					// JSON this should work without any problem but we should
					// make sure that
					// the massage is not chunked or otherwise damaged.
					try {
						json = JSON.parse( message.data );
					} catch ( er ) {
						a7.Log.error( "This doesn't look like valid JSON: ", message.data );
						return;
					}

					if ( json.type === 'history' ) { // entire message
														// history
						// insert every single message to the chat window
						for ( ix = 0; ix < json.data.length; ix++ ) {
							_addMessage( json.data[ ix ].text, new Date( json.data[ ix ].time ), "websocket" );
						}
					} else if ( json.type === 'message' ) { // it's a single
															// message
						_addMessage( json.data.text, new Date( json.data.time ), "websocket" );
					} else {
						a7.Log.error( "This doesn't look like valid JSON: ", json );
					}
				};

				window.addEventListener( "close", function( event ) {
					connection.close();
				} );

				a7.Console.addMessage = _addMessage;
				a7.Log.info( "Console initializing..." );
				resolve();
			}else{
				// console init should not run if console is set to false
				reject( "Console init should not be called when console option is set to false." );
			}

		}
	};

}() );
// derived from work by David Walsh
// https://davidwalsh.name/pubsub-javascript
// MIT License http://opensource.org/licenses/MIT

a7.Events = ( function() {
	"use strict";
	var topics = {},
		hOP = topics.hasOwnProperty;

	return {
		
		subscribe : function( topic, listener ) {
			// Create the topic's object if not yet created
			if ( !hOP.call( topics, topic ) ){
				topics[ topic ] = [];
			}

			// Add the listener to queue
			var index = topics[ topic ].push( listener ) - 1;

			// Provide handle back for removal of topic
			return {
				remove : function() {
					delete topics[ topic ][ index ];
				}
			};
		},
		init: function(){
			a7.Events.subscribe( "auth.login", function( params ){
				a7.Remote.invoke( "auth.login", { username : params.username, password : params.password } );
			});
			a7.Events.subscribe( "auth.refresh", function( params ){
				a7.Remote.invoke( "auth.refresh", params );
			});
			a7.Events.subscribe( "auth.sessionTimeout", function( params ){
			//	a7.Remote.invoke( "auth.sessionTimeout" );
			});
			a7.Events.subscribe( "auth.invalidateSession", function( params ){
				//	a7.Remote.invoke( "auth.sessionTimeout" );
			});
		},
		publish : function( topic, info ) {
			a7.Log.trace( "event: " + topic );
			// If the topic doesn't exist, or there's no listeners in queue,
			// just leave
			if ( !hOP.call( topics, topic ) ){
				return;
			}

			// Cycle through topics queue, fire!
			topics[ topic ].forEach( function( item ) {
				item( info || {} );
			} );
		}
	};
}());
a7.Log = ( function(){
	// logging levels ALL < TRACE < INFO < WARN < ERROR < FATAL < OFF
	var _ready = false,
		_deferred = [],
		_logLevel = "ERROR,FATAL,INFO",
		_log = function( message, level ){
			if( _ready && _logLevel.indexOf( level ) >=0 || _logLevel.indexOf( "ALL" ) >=0 ){
				console.log( message );
				if( a7.Model.get( "a7.console.enabled" ) ){
					a7.Console.addMessage( message, new Date(), "local", level );
				}
			} else if( ! _ready ){
				// store log messages before init so they can be logged after init
				_deferred.push( { message: message, level: level } );
			}
		};

	return{
		init: function(){
			
			_logLevel = a7.Model.get( "a7.logging" ).logLevel;
			_ready = true;
			_deferred.forEach( function( item ){
				_log( item.message, item.level );
			});
			_deffered = [];
			a7.Log.info( "Log initializing..." );
		},
		error: function( message ){
			_log( message, "ERROR" );
		},
		fatal: function( message ){
			_log( message, "FATAL" );
		},
		info: function( message ){
			_log( message, "INFO" );
		},
		trace: function( message ){
			_log( message, "TRACE" );
		},
		warn: function( message ){
			_log( message, "WARN" );
		}
	};
}());
a7.Model = ( function() {
	"use strict";
	var _model,
		_methods = {};

	return {
		create : function(){
			return _methods[ "create" ].apply( _model, arguments );
		},
		destroy : function(){
			return _methods[ "destroy" ].apply( _model, arguments );
		},
		get : function(){
			return _methods[ "get" ].apply( _model, arguments );
		},
		set : function(){
			return _methods[ "set" ].apply( _model, arguments );
		},
		exists : function(){
			return _methods[ "exists" ].apply( _model, arguments );
		},
		bind : function(){
			return _methods[ "bind" ].apply( _model, arguments );
		},
		init: function( options, resolve, reject ){
			a7.Log.info( "Model initializing... " );
			switch( options.model ){
				case "gadgetui":
					_model = gadgetui.model;
					// gadgetui maps directly, so we can loop on the keys
					Object.keys( gadgetui.model ).forEach( function( key, index ){
						if( key !== "BindableObject" ){
							_methods[ key ] = gadgetui.model[ key ];
						}
					});
					break;
			}
			resolve();
		}
	};

}() );
a7.Objects = ( function() {"use strict";function Constructor( constructor, args, addBindings ) {
	var ix, 
		returnedObj, 
		obj;

	if( addBindings === true ){
		//bindings = EventBindings.getAll();
		EventBindings.getAll().forEach( function( binding ){
			if( constructor.prototype[ binding ] === undefined ) {
				constructor.prototype[ binding ] = binding.func;
			}
		});
	}

	// construct the object
	obj = Object.create( constructor.prototype );
	returnedObj = constructor.apply( obj, args );
	if( returnedObj === undefined ){
		returnedObj = obj;
	}

	if( addBindings === true ){
		// create specified event list from prototype
		returnedObj.events = {};
		if( constructor.prototype.events !== undefined ){
			constructor.prototype.events.forEach( function( event ){
				returnedObj.events[ event ] = [ ];
			});
		}
	}

	return returnedObj;
	
}

/*
 * EventBindings
 * author: Robert Munn <robert.d.munn@gmail.com>
 * 
 */

var EventBindings = {
	on : function( event, func ){
		if( this.events[ event ] === undefined ){
			this.events[ event ] = [];
		}
		this.events[ event ].push( func );
		return this;
	},
	
	off : function( event ){
		// clear listeners
		this.events[ event ] = [];
		return this;
	},
	
	fireEvent : function( key, args ){
		var _this = this;
		this.events[ key ].forEach( function( func ){
			func( _this, args );
		});
	},
	
	getAll : function(){
		return [ { name : "on", func : this.on }, 
		         { name : "off", func : this.off },
				 { name : "fireEvent", func : this.fireEvent } ];
	}
};
function User(){
	// init User
	return this;
}

User.prototype.getMemento = function(){
	var user = {}, self = this;
	Object.keys( this ).forEach( function( key ){
		user[ key ] = self[ key ];
	});
	return user;
};
return {
	Constructor : Constructor,
	EventBindings : EventBindings,
	User: User
};}());
a7.Remote = ( function(){
	var _options = {},
		_time = new Date(),
		_token,
		_sessionTimer,
		_modules = {},
		hOP = _modules.hasOwnProperty,

		_setModule = function( key, module ){
			_modules[ key ] = module;
		};

	return{
		getToken : function(){
			return _token;
		},
		init: function( _modules ){
			_options = a7.Model.get( "a7.remote" );
			_options.sessionTimeout = a7.Model.get( "a7.auth.sessionTimeout" );
			// set token if valid
			if ( _options.useTokens && sessionStorage.token && sessionStorage.token !== '' ) {
				_token = sessionStorage.token;
			}

			var authModule = {
					login: function( username, password, callback ){
						var headers = new Headers(),
							request,
							params = { 	method: 'POST', 
										headers: {
											"Authorization": "Basic " + a7.Util.base64.encode64( username + ":" + password )
										} 
									};
	
						request = new Request( _options.loginURL , params );
	
						var promise = fetch( request )
	
						promise
							.then( function( response ) {
								var token = response.headers.get("X-Token");
								if( token !== undefined && token !== null ){
									_token = token;
									sessionStorage.token = token;
								}
							});
						if( callback !== undefined ){
							callback( promise );
						}
					},
					refresh: function( params ){
						a7.Remote.fetch( _options.refreshURL, params, true )
						.then( function( response ) {
							return response.json();
						})
						.then( function( json ){
							a7.Log.info( JSON.stringify( json ) );
						});
					}
				};

			_setModule( "auth", authModule );

			Object.keys( _modules ).forEach( function( key ){
				_setModule( key, _modules[ key ] );
			});

		},

		fetch: function( uri, params, secure ){
			a7.Log.info( "fetch: " + uri );
			if( secure ){
				var headers = ( params.headers || new Headers() ),
					currentTime = new Date( ),
					request,
					promise,
					diff = Math.abs( currentTime - _time ), 
					minutes = Math.floor( ( diff / 1000 ) / 60 );
	
				if( minutes > _options.sessionTimeout ){
					// timeout
					
				}else if( _token !== undefined && _token !== null ){
					headers.set( "X-Token", _token );
				}

				if ( _sessionTimer !== undefined ) {
					clearTimeout( _sessionTimer );
					_sessionTimer = undefined;
				}
	
				_time = currentTime;
				
				request = new Request( uri, params );
				promise = fetch( request );
				
				promise
					.then( function( response ){
						var token = response.headers.get( "X-Token" );
						if( token !== undefined && token !== null ){
							_token = token;
							sessionStorage.token = token;
							
							if ( _sessionTimer === undefined ) {
								_sessionTimer = setTimeout( function( ) {
								a7.Events.publish( "auth.refresh" );
								}, _options.sessionTimeout );
							}
							
							if( params.resolve !== undefined ){
								params.resolve( true );
							}
						} else{
							if( params.resolve !== undefined ){
								params.resolve( false );
							}
							a7.Events.publish( "auth.sessionTimeout" );
						}
						//console.log( JSON.stringify( response, null, 4) );
					});
				/*	
				if( json.status === "Not authorized" && json.code === 401 ){
					//abort existing calls and empty the queue
					for( ix = 0; ix < queue.length; ix++ ){
						//don't abort the current request, it is complete.
						if( queue[ ix ] !== jqXHR ){
							queue[ ix ].abort();
						}
					}
					if( this.url === "/index.cfm/api/auth/login" ){
						if( opts.options.loginUI !== undefined ){
							opts.options.loginUI.clearOverlay();
							opts.options.loginUI.selector.effect( "shake" );
						}
						//app.ui.alert( "Authentication", "Login failed. Please check your credentials and try again." );
					}
					$.publish( "app.deinit" );
					queue = [];

				}else{
					console.log( "checking token for url: " + this.url );
					token = jqXHR.getResponseHeader( "X-Token" );
					if( token !== undefined && token !== null ){
						app.model.set( "token", token );
						sessionStorage.token = token;
					}

					if ( app.model.get( "user.userid" ) > 0 ) {
						if ( app.getToken === undefined ) {
							app.getToken = setTimeout( function( ) {
							$.publish( "user.refresh" );
							}, 100000 );
						}
					}				
					deferred.resolve.apply( this, arguments );
				}
			});
			jqXHR.fail( function() {
			    deferred.reject.apply( this, arguments );
			});

			jqXHR.always( function(){
				var ix, data, status, xhr, response, token; 
				if( arguments[1] === 'success' ){
					data = arguments[ 0 ];
					status = arguments[1];
					xhr = arguments[ 2 ];
				}else{
					xhr = arguments[ 0 ];
					status = arguments[1];
					error = arguments[ 2 ];       		
				}
				try{
					response = JSON.parse( xhr.responseText );
				}catch( e ){
					response = { error : false, messages: "" };
				}
				// remove request from the queue
				for( ix = 0; ix < queue.length; ix++ ){
					if( queue[ ix ] === jqXHR ){
						queue.splice( ix, 1 );
					}
				}
			});	*/
			
			return promise;
				
			}else{
				return fetch( uri, params );
			}
				
		},

		// a7.Remote.invoke( 'user.refresh', params );
		invoke: function( moduleAction, params ){
			var mA = moduleAction.split( "." );
			// if no action specified, return the list of actions
			if( mA.length < 2 ){
				a7.Log.error( "No action specified. Valid actions are: " + Object.keys( _modules[ mA[ 0 ] ] ).toString() );
				return;
			}
			if( typeof _modules[ mA[ 0 ] ][ mA[ 1 ] ] === "function" ){
				_modules[ mA[ 0 ] ][ mA[ 1 ] ]( params );
			}
		}
	};
}());
a7.Security = ( function() {
	"use strict";

	var _options = {},
		_isAuthenticated = function( resolve, reject ){
			a7.Log.info( "Checking authenticated state.. " );
			if( a7.Model.get( "a7.remote.useTokens" ) ){
				var token = a7.Remote.getToken();
				if( token !== undefined &&  token !== null && token.length > 0 ){
					a7.Log.info( "Refreshing user..." );
					// if there is a valid token, check authentication state with the server
					a7.Events.publish( "auth.refresh", { resolve: resolve, reject : reject } );
				}else{
					a7.Events.publish( "a7.auth.invalidateSession" );
					resolve( false );
				}
			}
		};

	return {
		isAuthenticated : _isAuthenticated,
		// initialization 
		// 1. creates a new a7.User object
		// 2. checks sessionStorage for user string
		// 3. populates User object with stored user information in case of 
		// 	  browser refresh
		// 4. sets User object into a7.Model

		init : function() {
			a7.Log.info( "Security initializing..." );
			var suser, keys, user = a7.Objects.Constructor( a7.Objects.User, [], true );
			if ( sessionStorage.user && sessionStorage.user !== '' ) {
				suser = JSON.parse( sessionStorage.user );
				Object.keys( suser ).map( function( key ) {
					user[ key ] = suser[ key ];
				});
			}
			a7.Model.set( "a7.user", user );
		}
	};
}());

a7.UI = ( function() {
		"use strict";

		var _options = {},
			_selectors = {},
			_templateMap = {},

			_setSelector = function( name, selector ){
				_selectors[ name ] = selector;
			},
	
			_addTemplate = function( key, html ){
				switch( _options.renderer ){
					case "Mustache":
						_templateMap[ key ] = html.trim();
						break;
					case "Handlebars":
						_templateMap[ key ] = Handlebars.compile( html.trim() );
						break;
				}
			},
	
			_loadTemplates = function( resolve, reject ){
				var ot = Math.ceil( Math.random( ) * 500 );
	
				switch( _options.renderer ){
					case "Mustache":
					case "Handlebars":
						fetch( _options.templates + '?' + ot )
							.then( function( response ) {
								return response.text();
							})
							.then( function( text ){
								a7.Log.info( "Loading " + _options.renderer + " templates... " );
								var parser = new DOMParser(),
									doc = parser.parseFromString( text, "text/html" ),
									scripts = doc.querySelectorAll( "script" );
								scripts.forEach( function( script ){
									_addTemplate( script.getAttribute( "id" ), script.innerHTML );
								});
								resolve();
							});
	
						break;
				}
			},
			
			_render = function( template, params ){
				switch( _options.renderer ){
				case "Mustache":
					return Mustache.to_html( _templateMap[ template ], params, _templateMap );
					break;
				case "Handlebars":
					return _templateMap[ template ]( params );
					break;
				}
			};

		return{
			render : _render,
			selectors: _selectors,
			setSelector: _setSelector,
			init : function( resolve, reject ){
				var renderers = "Handlebars,Mustache";
				_options = a7.Model.get( "a7.UI" );
				
				a7.Log.info( "Layout initializing..." );
				if( renderers.indexOf( _options.renderer ) >=0 ){
					a7.Model.set( "a7.UI.templatesLoaded", false );
					if( _options.templates !== undefined ){
						_loadTemplates( resolve, reject );
					}
				}else{
					resolve();
				}
			}
		};

}( ) );
a7.Util = ( function(){


	return{
		// split by commas, used below
		split : function( val ) {
			return val.split( /,\s*/ );
		},
	
		// return the last item from a comma-separated list
		extractLast : function( term ) {
			return this.split( term ).pop();
		},
	
		// encode and decode base64
		base64 : {
			keyStr : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
	
			encode64 : function( input ) {
				if ( !String( input ).length ) {
					return false;
				}
				var output = "", chr1, chr2, chr3, enc1, enc2, enc3, enc4, i = 0;
	
				do {
					chr1 = input.charCodeAt( i++ );
					chr2 = input.charCodeAt( i++ );
					chr3 = input.charCodeAt( i++ );
	
					enc1 = chr1 >> 2;
					enc2 = ( ( chr1 & 3 ) << 4 ) | ( chr2 >> 4 );
					enc3 = ( ( chr2 & 15 ) << 2 ) | ( chr3 >> 6 );
					enc4 = chr3 & 63;
	
					if ( isNaN( chr2 ) ) {
						enc3 = enc4 = 64;
					} else if ( isNaN( chr3 ) ) {
						enc4 = 64;
					}
	
					output = output + this.keyStr.charAt( enc1 )
							+ this.keyStr.charAt( enc2 )
							+ this.keyStr.charAt( enc3 )
							+ this.keyStr.charAt( enc4 );
				} while ( i < input.length );
	
				return output;
			},
	
			decode64 : function( input ) {
				if ( !input ) {
					return false;
				}
				var output = "", chr1, chr2, chr3, enc1, enc2, enc3, enc4, i = 0;
	
				// remove all characters that are not A-Z, a-z, 0-9, +, /, or =
				input = input.replace( /[^A-Za-z0-9\+\/\=]/g, "" );
	
				do {
					enc1 = this.keyStr.indexOf( input.charAt( i++ ) );
					enc2 = this.keyStr.indexOf( input.charAt( i++ ) );
					enc3 = this.keyStr.indexOf( input.charAt( i++ ) );
					enc4 = this.keyStr.indexOf( input.charAt( i++ ) );
	
					chr1 = ( enc1 << 2 ) | ( enc2 >> 4 );
					chr2 = ( ( enc2 & 15 ) << 4 ) | ( enc3 >> 2 );
					chr3 = ( ( enc3 & 3 ) << 6 ) | enc4;
	
					output = output + String.fromCharCode( chr1 );
	
					if ( enc3 !== 64 ) {
						output = output + String.fromCharCode( chr2 );
					}
					if ( enc4 !== 64 ) {
						output = output + String.fromCharCode( chr3 );
					}
				} while ( i < input.length );
	
				return output;
			}
		},
	
		// add a leading zero to single numbers so the string is at least two characters
		leadingZero : function( n ) {
			return ( n < 10 ) ? ( "0" + n ) : n;
		},
	
		dynamicSort : function( property ) {
			var sortOrder = 1;
			if ( property[ 0 ] === "-" ) {
				sortOrder = -1;
				property = property.substr( 1 );
			}
			return function( a, b ) {
				var result = ( a[ property ] < b[ property ] ) ? -1
						: ( a[ property ] > b[ property ] ) ? 1 : 0;
				return result * sortOrder;
			};
		},
	
		// return yes|no for 1|0
		yesNo : function( val ) {
			return parseInt( val, 10 ) < 1 ? "No" : "Yes";
		},
	
		// validate a javascript date object
		isValidDate : function( d ) {
			if ( Object.prototype.toString.call( d ) !== "[object Date]" ) {
				return false;
			}
			return !isNaN( d.getTime() );
		},
	
		// generate a pseudo-random ID
		id : function() {
			return ( ( Math.random() * 100 ).toString() + ( Math.random() * 100 )
					.toString() ).replace( /\./g, "" );
		},
	
		// try/catch a function
		tryCatch : function( fn, ctx, args ) {
			var errorObject = {
				value : null
			};
			try {
				return fn.apply( ctx, args );
			} catch ( e ) {
				errorObject.value = e;
				return errorObject;
			}
		},
	
		// return a numeric representation of the value passed
		getNumberValue : function( pixelValue ) {
			return ( isNaN( Number( pixelValue ) ) ? Number( pixelValue.substring( 0, pixelValue.length - 2 ) ) : pixelValue );
		},
	
		// check whether a value is numeric
		isNumeric : function( num ) {
			return !isNaN( parseFloat( num ) ) && isFinite( num );
		},
	
		// get top/left offset of a selector on screen
		getOffset : function( selector ) {
			var rect = selector.getBoundingClientRect();
	
			return {
				top : rect.top + document.body.scrollTop,
				left : rect.left + document.body.scrollLeft
			};
		}
	};
}());
//# sourceMappingURL=a7.js.map