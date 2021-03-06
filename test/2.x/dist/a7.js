
export var a7 = a7;

var a7 = (function() {
  "use strict";
  return {
    // initialization
    // 1. sets console and templating options
    // 2. initializes user object
    // 3. checks user auth state
    // 4. renders initial layout
    init: function(options, initResolve, initReject) {
      var pr, p0, p1, p2;

      options.model = ( options.model !== undefined ? options.model : "altseven" );
      if (options.model === "") {
        // model required
        initReject("A model is required, but no model was specified.");
      }

      pr = new Promise(function(resolve, reject) {
        a7.log.trace("a7 - model init");
        a7.model.init(options, resolve, reject);
      });

      pr.then(function() {
        a7.model.set("a7", {
          auth: {
            sessionTimeout: (options.auth && options.auth.sessionTimeout ? options.auth.sessionTimeout : 60 * 15 * 1000 )
          },
          console: ( options.console ? {
            enabled: options.console.enabled || false,
            wsServer: options.console.wsServer || "",
            container: options.console.container || ( typeof gadgetui === "object" ? gadgetui.display.FloatingPane : "" ),
            top: options.console.top || 100,
            left: options.console.left || 500,
            width: options.console.width || 500,
            height: options.console.height || 300
          } : {} ),
          logging: {
            logLevel: ( options.logging && options.logging.logLevel ? options.logging.logLevel : "ERROR,FATAL,INFO" )
          },
          model: options.model,
          remote: ( options.remote ? {
            // modules: ( options.remote.modules | undefined ) // don't set into Model since they are being registered in Remote
            loginURL: options.remote.loginURL || "",
            logoutURL: options.remote.logoutURL || "",
            refreshURL: options.remote.refreshURL || "",
            useTokens: ( options.auth && options.auth.useTokens ? options.auth.useTokens : true )
          } : { useTokens: true } ),
          ui: {
            renderer: ( options.ui ?
              options.ui.renderer ||
              ( typeof Mustache === "object"
                ? "Mustache"
                : typeof Handlebars === "object"
                ? "Handlebars"
                : "templateLiterals" )
              : "templateLiterals" )
          },
          ready: false,
          user: ""
        });
      }).then(function() {
        p0 = new Promise(function(resolve, reject) {
          if (a7.model.get("a7.console").enabled) {
            a7.log.trace("a7 - console init");
            a7.console.init(resolve, reject);
          } else {
            resolve();
          }
        });

        p0.then(function() {
          a7.log.trace("a7 - log init");
          a7.log.init();
            a7.log.trace("a7 - security init");
            // init user state
            a7.security.init();
            a7.log.trace("a7 - remote init");
            a7.remote.init( ( options.remote && options.remote.modules ? options.remote.modules : {} ) );
            a7.log.trace("a7 - events init");
            a7.events.init();
            p1 = new Promise(function(resolve, reject) {
              a7.log.trace("a7 - layout init");
              // initialize templating engine
              a7.ui.init(resolve, reject);
            });

            p1.then(function() {
              p2 = new Promise(function(resolve, reject) {
                a7.log.trace("a7 - isSecured");
                // check whether user is authenticated
                a7.security.isAuthenticated(resolve, reject);
              });

              p2.then(function(secure) {
                a7.log.info("Authenticated: " + secure + "...");
                a7.log.info("Init complete...");
                initResolve({
                  secure: secure
                });
              });

              p2["catch"](function(message) {
                a7.log.error(message);
                initReject();
              });
            });
          });

        p0["catch"](function(message) {
          a7.log.error(message);
          initReject();
        });
      });

      pr["catch"](function(message) {
        a7.log.error(message);
        initReject();
      });
    }
  };
})();


a7.console = (function() {
  "use strict";

  var title = "Console Window",
    // the div we'll create to host the console content
    consoleDiv,
    // flag whether console is running
    active = false,
    _addMessage = function(message, dt, source, level) {
      var div = document.createElement("div");
      div.setAttribute("class", "a7-console-row-" + source);
      if (level !== undefined) {
        div.innerHTML = level + ": ";
        div.setAttribute(
          "class",
          div.getAttribute("class") + " a7-console-row-" + level
        );
      }
      div.innerHTML +=
        +(dt.getHours() < 10 ? "0" + dt.getHours() : dt.getHours()) +
        ":" +
        (dt.getMinutes() < 10 ? "0" + dt.getMinutes() : dt.getMinutes()) +
        ": " +
        message;
      consoleDiv.appendChild(div);
    };

  return {
    init: function(resolve, reject) {
      var console = a7.model.get("a7.console");
      if( console.container === "" ) reject( "You must specify a container object for the console display." );

      // check for console state
      if ( console.enabled ) {
        active = true;
        consoleDiv = document.createElement("div");
        consoleDiv.setAttribute("id", "consoleDiv");
        consoleDiv.setAttribute("class", "a7-console");
        document.body.append(consoleDiv);

        var connection,
          fp = a7.components.Constructor(
            console.container,
            [
              consoleDiv,
              {
                width: console.width,
                left: console.left,
                height: console.height,
                title: title,
                top: console.top,
                enableShrink: false,
                enableClose: true
              }
            ],
            false
          );

        fp.selector.setAttribute("right", 0);

        if( console.wsServer ){
          window.WebSocket = window.WebSocket || window.MozWebSocket;

          // if browser doesn't support WebSocket, just show some
          // notification and exit
          if (!window.WebSocket) {
            consoleDiv.innerHTML("Your browser doesn't support WebSockets.");
            return;
          }

          // open connection
          connection = new WebSocket(console.wsServer);

          connection.onopen = function() {
            //a7.log.info( "Console initializing..." );
          };

          connection.onerror = function() {
            var message = "Can't connect to the console socket server.";
            if (console.enabled) {
              // just in there were some problems with conenction...
              _addMessage(message, new Date(), "local");
            } else {
              a7.log.error(message);
            }
          };

          // most important part - incoming messages
          connection.onmessage = function(message) {
            var json, ix;
            // try to parse JSON message. Because we know that the
            // server always returns
            // JSON this should work without any problem but we should
            // make sure that
            // the massage is not chunked or otherwise damaged.
            try {
              json = JSON.parse(message.data);
            } catch (er) {
              a7.log.error("This doesn't look like valid JSON: ", message.data);
              return;
            }

            if (json.type === "history") {
              // entire message
              // history
              // insert every single message to the chat window
              for (ix = 0; ix < json.data.length; ix++) {
                _addMessage(
                  json.data[ix].text,
                  new Date(json.data[ix].time),
                  "websocket"
                );
              }
            } else if (json.type === "message") {
              // it's a single
              // message
              _addMessage(json.data.text, new Date(json.data.time), "websocket");
            } else {
              a7.log.error("This doesn't look like valid JSON: ", json);
            }
          };

          window.addEventListener("close", function() {
            connection.close();
          });
        }

        a7.console.addMessage = _addMessage;
        a7.log.info("Console initializing...");
        resolve();
      } else {
        // console init should not run if console is set to false
        reject( "Console init should not be called when console option is set to false." );
      }
    }
  };
})();

a7.error = (function() {
  "use strict";

  var _captureError = function(msg, url, lineNo, columnNo, error) {
    var string = msg.toLowerCase();
    var substring = "script error";
    if (string.indexOf(substring) > -1) {
      a7.log.error("Script Error: See Browser Console for Detail");
    } else {
      var message = [
        "Message: " + msg,
        "URL: " + url,
        "Line: " + lineNo,
        "Column: " + columnNo,
        "Error object: " + JSON.stringify(error)
      ].join(" - ");

      a7.log.error(message);
    }
  };

  window.onerror = function(msg, url, lineNo, columnNo, error) {
    a7.error.captureError(msg, url, lineNo, columnNo, error);
    return false;
  };

  return {
    capture: function() {},
    captureError: _captureError
  };
})();

// derived from work by David Walsh
// https://davidwalsh.name/pubsub-javascript
// MIT License http://opensource.org/licenses/MIT

a7.events = (function() {
  "use strict";
  var topics = {},
    hasProp = topics.hasOwnProperty;

  return {
    subscribe: function(topic, listener) {
      // Create the topic's object if not yet created
      if (!hasProp.call(topics, topic)) {
        topics[topic] = [];
      }

      // Add the listener to queue
      var index = topics[topic].push(listener) - 1;

      // Provide handle back for removal of topic
      return {
        remove: function() {
          delete topics[topic][index];
        }
      };
    },
    init: function() {
      a7.events.subscribe("auth.login", function(params) {
        a7.remote.invoke("auth.login", params);
      });
      a7.events.subscribe("auth.logout", function(params) {
        a7.remote.invoke("auth.logout", params);
      });
      a7.events.subscribe("auth.refresh", function(params) {
        a7.remote.invoke("auth.refresh", params);
      });
      a7.events.subscribe("auth.sessionTimeout", function() {
        //	a7.remote.invoke( "auth.sessionTimeout" );
      });
      a7.events.subscribe("auth.invalidateSession", function() {
        //	a7.remote.invoke( "auth.sessionTimeout" );
      });
    },
    publish: function(topic, info) {
      a7.log.trace("event: " + topic);
      // If the topic doesn't exist, or there's no listeners in queue,
      // just leave
      if (!hasProp.call(topics, topic)) {
        return;
      }

      // Cycle through topics queue, fire!
      topics[topic].forEach(function(item) {
        item(info || {});
      });
    }
  };
})();

a7.log = ( function(){
	// logging levels ALL < TRACE < INFO < WARN < ERROR < FATAL < OFF
	var _ready = false,
		_deferred = [],
		_logLevel = "ERROR,FATAL,INFO",
		_log = function( message, level ){
			if( _ready && _logLevel.indexOf( level ) >=0 || _logLevel.indexOf( "ALL" ) >=0 ){
				//console.log( message );
				if( a7.model.get( "a7.console" ).enabled ){
					a7.console.addMessage( message, new Date(), "local", level );
				}
			} else if( ! _ready ){
				// store log messages before init so they can be logged after init
				_deferred.push( { message: message, level: level } );
			}
		};

	return{
		init: function(){

			_logLevel = a7.model.get( "a7.logging" ).logLevel;
			_ready = true;
			_deferred.forEach( function( item ){
				_log( item.message, item.level );
			});
			//_deffered = [];
			a7.log.info( "Log initializing..." );
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

a7.model = ( function() {
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
		init: function( options, resolve ){
			a7.log.info( "Model initializing... " );

			if( typeof options.model == "string" ){
				switch( options.model ){
					case "altseven":
						_model = a7.components.Model;
						break;
					case "gadgetui":
						_model = gadgetui.model;
						break;
				}
			}else if( typeof options.model == "object" ){
				_model = options.model;
			}
			a7.log.trace( "Model set: " + _model );
			// gadgetui maps directly, so we can loop on the keys
			Object.keys( _model ).forEach( function( key ){
				if( key !== "BindableObject" ){
					_methods[ key ] = _model[ key ];
				}
			});

			resolve();
		}
	};
}() );

a7.components = ( function() {"use strict";function Constructor( constructor, args, addBindings ) {
	var returnedObj,
		obj;

	// add bindings for custom events
	// this section pulls the bindings ( on, off, fireEvent ) from the
	// EventBindings object and add them to the object being instantiated
	if( addBindings === true ){
		//bindings = EventBindings.getAll();
 		EventBindings.getAll().forEach( function( binding ){
			if( constructor.prototype[ binding ] === undefined ) {
				constructor.prototype[ binding.name ] = binding.func;
			}
		});
	}

	// construct the object
	obj = Object.create( constructor.prototype );
	returnedObj = constructor.apply( obj, args );
	if( returnedObj === undefined ){
		returnedObj = obj;
	}

	// this section adds any events specified in the prototype as events of
	// the object being instantiated
	// you can then trigger an event from the object by calling:
	// <object>.fireEvent( eventName, args );
	// args can be anything you want to send with the event
	// you can then listen for these events using .on( eventName, function(){});
	// <object>.on( eventName, function(){ })
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
		return [ 	{ name : "on", func : this.on },
							{ name : "off", func : this.off },
							{ name : "fireEvent", func : this.fireEvent } ];
	}
};

var Model = ( function() {
	"use strict";

	var _model = {};
	function BindableObject( data, element ) {
		this.data = data;
		this.elements = [ ];
		if ( element !== undefined ) {
			this.bind( element );
		}
	}

	BindableObject.prototype.handleEvent = function( ev ) {
		var ix, obj;
		switch ( ev.type ) {
			case "change":
				for( ix = 0; ix < this.elements.length; ix++ ){
					obj = this.elements[ ix ];
					if( ev.originalSource === undefined ){
						ev.originalSource = "BindableObject.handleEvent['change']";
					}
					if( ev.target.name === obj.prop && ev.originalSource !== 'BindableObject.updateDomElement' ){
						//select box binding
						if( ev.target.type.match( /select/ ) ){
							this.change( { 	id : ev.target.value,
									text : ev.target.options[ev.target.selectedIndex].innerHTML
								}, ev, obj.prop );
						}
						else{
						// text input binding
						this.change( ev.target.value, ev, obj.prop );
						}
					}
				}

		}
	};

	// for each bound control, update the value
	BindableObject.prototype.change = function( value, event, property ) {
		var ix, obj;
		if( event.originalSource === undefined ){
			event.originalSource = "BindableObject.change";
		}
		console.log( "change : Source: " + event.originalSource );

		// this code changes the value of the BinableObject to the incoming value
		if ( property === undefined ) {
			// Directive is to replace the entire value stored in the BindableObject
			// update the BindableObject value with the incoming value
			// value could be anything, simple value or object, does not matter
			this.data = value;
		}
		else if ( typeof this.data === 'object' ) {
			//Directive is to replace a property of the value stored in the BindableObject
			// verifies _this "data" is an object and not a simple value
			// update the BindableObject's specified property with the incoming value
			// value could be anything, simple value or object, does not matter

			if( this.data[ property ] === undefined ){
				throw( "Property '" + property + "' of object is undefined." );
			}
			else{
				this.data[ property ] = value;
			}
			// check if we are updating only a single property or the entire object

		}
		else {
			throw "Attempt to treat a simple value as an object with properties. Change fails.";
		}

		// check if there are other dom elements linked to the property
		for( ix = 0; ix < this.elements.length; ix++ ){
			obj = this.elements[ ix ];
			if( ( property === undefined || property === obj.prop ) && ( event.target !== undefined && obj.elem != event.target ) ){
				this.updateDomElement( event,  obj.elem, value );
			}
		}
	};

	BindableObject.prototype.updateDom = function( event, value, property ){
		var ix, obj, key;
		if( event.originalSource === undefined ){
			event.originalSource = 'BindableObject.updateDom';
		}
		// this code changes the value of the DOM element to the incoming value
		for( ix = 0; ix < this.elements.length; ix++ ){
			obj = this.elements[ ix ];

			if ( property === undefined  ){
				if( typeof value === 'object' ){
					for( key in value ){
						if( this.elements[ ix ].prop === key ){
							this.updateDomElement( event, obj.elem, value[ key ] );
						}
					}
				}else{
					// this code sets the value of each control bound to the BindableObject
					// to the correspondingly bound property of the incoming value
					this.updateDomElement( event, obj.elem, value );
				}

				//break;
			}else if ( obj.prop === property ){
				this.updateDomElement( event, obj.elem, value );
			}
		}
	};

	BindableObject.prototype.updateDomElement = function( event, selector, newValue ){
		var valueElements = "INPUT";
		var arrayElements = "OL,UL,SELECT";
		var wrappingElements = "DIV,SPAN,H1,H2,H3,H4,H5,H6,P,TEXTAREA,LABEL,BUTTON";

		var _updateOptions = function(){
			switch( selector.tagName ){
				case "SELECT":
					while (selector.firstChild) {
						selector.removeChild(selector.firstChild);
					}
					var idx = 0;
					newValue.forEach( function( item ){
						var opt = document.createElement("option");
						if( typeof item === 'object' ){
							opt.value = item.id;
							opt.text = item.text;
						}else{
							opt.text = item;
						}
						selector.appendChild( opt );
						idx++;
					});
				break;
				case "UL":
				case "OL":
					while (selector.firstChild) {
						selector.removeChild(selector.firstChild);
					}
					newValue.forEach( function( item ){
						var opt = document.createElement("li");
						opt.textContent = item;
						selector.appendChild( opt );
					});
				break;
			}
		};

		if( event.originalSource === undefined ){
			event.originalSource = "BindableObject.updateDomElement";
		}
		//console.log( "updateDomElement : selector: { type: " + selector.nodeName + ", name: " + selector.name + " }" );
		//console.log( "updateDomElement : Source: " + event.originalSource );

		// updating the bound DOM element requires understanding what kind of DOM element is being updated
		// and what kind of data we are dealing with

		if( typeof newValue === 'object' ){
			// select box objects are populated with { text: text, id: id }
			if( valueElements.indexOf( selector.tagName ) >=0 ){
				selector.value = newValue.id;
			}else if( arrayElements.indexOf( selector.tagName ) >=0 ){
				_updateOptions();
			}else{
				selector.textContent = newValue.text;
			}
		}else{
			if( valueElements.indexOf( selector.tagName ) >=0 ){
				selector.value = newValue;
			}else if( arrayElements.indexOf( selector.tagName ) >=0 ){
				_updateOptions();
			}else{
				selector.textContent = newValue;
			}
		}

		// we have three ways to update values
		// 1. via a change event fired from changing the DOM element
		// 2. via model.set() which should change the model value and update the dom element(s)
		// 3. via a second dom element, e.g. when more than one dom element is linked to the property
		//    we need to be able to update the other dom elements without entering an infinite loop
		if( event.originalSource !== 'model.set' ){
			var ev = new Event( "change" );
			ev.originalSource = 'model.updateDomElement';
			selector.dispatchEvent( ev );
		}
	};

	// bind an object to an HTML element
	BindableObject.prototype.bind = function( element, property ) {
		var e, _this = this;

		if ( property === undefined ) {
			// BindableObject holds a simple value
			// set the DOM element value to the value of the Bindable object
			element.value = this.data;
			e = {
				elem : element,
				prop : ""
			};
		}
		else {
			// Bindable object holds an object with properties
			// set the DOM element value to the value of the specified property in the
			// Bindable object
			element.value = this.data[ property ];
			e = {
				elem : element,
				prop : property
			};
		}
		//add an event listener so we get notified when the value of the DOM element
		// changes
		//element[ 0 ].addEventListener( "change", this, false );
		//IE 8 support
		if (element.addEventListener) {
			element.addEventListener( "change", this, false);
		}
		else {
			// IE8
			element.attachEvent("onpropertychange", function( ev ){
				if( ev.propertyName === 'value'){
					var el = ev.srcElement, val = ( el.nodeName === 'SELECT' ) ? { id: el.value, text: el.options[el.selectedIndex].innerHTML } : el.value;
					_this.change( val, { target: el }, el.name );
				}
			});
		}
		this.elements.push( e );
	};

	return {
		BindableObject : BindableObject,

		create : function( name, value, element ) {
			if ( element !== undefined ) {
				_model[ name ] = new BindableObject( value, element );
			}
			else {
				_model[ name ] = new BindableObject( value );
			}
		},

		destroy : function( name ) {
			delete _model[ name ];
		},

		bind : function( name, element ) {
			var n = name.split( "." );
			if ( n.length === 1 ) {
				_model[ name ].bind( element );
			}
			else {
				_model[ n[ 0 ] ].bind( element, n[ 1 ] );
			}
		},

		exists : function( name ) {
			if ( _model.hasOwnProperty( name ) ) {
				return true;
			}

			return false;
		},
		// getter - if the name of the object to get has a period, we are
		// getting a property of the object, e.g. user.firstname
		get : function( name ) {
			if( name === null || name === undefined ){
				console.log( "Expected parameter [name] is not defined." );
				return;
			}

			var n = name.split( "." );
			try{
				if ( n.length === 1 ) {
					if( _model[name] === undefined ){
						throw "Key '" + name + "' does not exist in the model.";
					}else{
						return _model[ name ].data;
					}
				}
				if( _model[n[0]] === undefined ){
					throw "Key '" + n[0] + "' does not exist in the model.";
				}
				return _model[n[0]].data[ n[ 1 ] ];

			}catch( e ){
				console.log( e );
				return undefined;
			}
		},

		// setter - if the name of the object to set has a period, we are
		// setting a property of the object, e.g. user.firstname
		set : function( name, value ) {
			if( name === null || name === undefined ){
				console.log( "Expected parameter [name] is not defined." );
				return;
			}

			var n = name.split( "." ), event = { originalSource : 'model.set'};
			if ( this.exists( n[ 0 ] ) === false ) {
				if ( n.length === 1 ) {
					this.create( name, value );
				}
				else {
					// don't create complex objects, only simple values
					throw "Object " + n[ 0 ] + "is not yet initialized.";
				}
			}
			else {
				if ( n.length === 1 ) {
					_model[ name ].change( value, event );
					_model[ name ].updateDom( event, value );
				}
				else {
					_model[ n[ 0 ] ].change( value, event, n[1] );
					_model[ n[ 0 ] ].updateDom( event, value, n[1] );
				}
			}
			//console.log( "model value set: name: " + name + ", value: " + value );
		}
	};

}() );

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

function View( props ){
	this.renderer = a7.model.get("a7.ui").renderer;
	this.type = 'View';
	this.props = props;
	if( this.props !== undefined ){
		for( var prop in this.props ){
			if( props[ prop ].type !== undefined && props[ prop ].type === 'View' ){
				props[ prop ].on( "mustRender", function(){
					this.fireEvent( "mustRender" );
				}.bind( this ));
			}
		}
	}

	this.state = {};
  this.template = "";
}

View.prototype = {
	events : ['mustRender','rendered'],
  setState: function( args ){
    this.state = args;
    // setting state requires a re-render
		this.fireEvent( 'mustRender' );
  },
  render: function(){
    return this.template;
  }
};

return {
  Constructor: Constructor,
  EventBindings: EventBindings,
  Model: Model,
  User: User,
  View: View
};
}());
//
a7.remote = ( function(){
	var _options = {},
		_time = new Date(),
		_token,
		_sessionTimer,
		_modules = {},

		_setModule = function( key, module ){
			_modules[ key ] = module;
		};

	return{
		getToken : function(){
			return _token;
		},

		getSessionTimer : function(){
				return _sessionTimer;
		},

		init: function( _modules ){
			_options = a7.model.get( "a7.remote" );
			_options.sessionTimeout = a7.model.get( "a7.auth" ).sessionTimeout;
			// set token if valid
			if( _options.useTokens && sessionStorage.token && sessionStorage.token !== '' ) {
				_token = sessionStorage.token;
			}

			var authModule = {
					login: function( params ){
						var request,
								args = { 	method: 'POST',
										headers: {
											"Authorization": "Basic " + a7.util.base64.encode64( params.username + ":" + params.password )
										}
								};

						request = new Request( _options.loginURL , args );

						var promise = fetch( request );

						promise
							.then( function( response ) {
								var token = response.headers.get("X-Token");
								if( token !== undefined && token !== null ){
									_token = token;
									sessionStorage.token = token;
								}
								return response.json();
							})
							.then( function( json ){
								var user = a7.model.get( "a7.user" );
								Object.keys( json.user ).map( function( key ) {
									user[ key ] = json.user[ key ];
								});
								sessionStorage.user = JSON.stringify( user );
								a7.model.set( "a7.user", user );
								if( params.callback !== undefined ){
									params.callback( json );
								}
							});
					},
					logout: function( params ){
						var request,
								args = { 	method: 'POST',
										headers: {
											"Authorization": "Basic " + a7.util.base64.encode64( params.username + ":" + params.password )
										}
								};

						request = new Request( _options.logoutURL , args );

						var promise = fetch( request );

						promise
							.then( function( response ) {
								var token = "";
								if( token !== undefined && token !== null ){
									_token = token;
									sessionStorage.token = token;
								}
								return response.json();
							})
							.then( function( json ){
								var user = user = a7.components.Constructor(a7.components.User, [], true);
								sessionStorage.user = JSON.stringify( user );
								a7.model.set( "a7.user", user );
								if( params.callback !== undefined ){
									params.callback();
								}
							});
					},
					refresh: function( params ){
						a7.remote.fetch( _options.refreshURL, {}, true )
						// initial fetch needs to parse response
						.then( function( response ){
							return response.json();
						})
						.then( function( json ){
							// then json is handled
							if( params.resolve !== undefined ){
								params.resolve( json.success );
							}
						});
					}
				};

			// add the auth module
			_setModule( "auth", authModule );

			// add application modules
			Object.keys( _modules ).forEach( function( key ){
				_setModule( key, _modules[ key ] );
			});
		},

		fetch: function( uri, params, secure ){
			a7.log.info( "fetch: " + uri );
			var request,
					promise;

			//if secure and tokens, we need to check timeout and add X-Token header
			if( secure && _options.useTokens ){
				var currentTime = new Date( ),
						diff = Math.abs( currentTime - _time ),
						minutes = Math.floor( ( diff / 1000 ) / 60 );

				if( minutes > _options.sessionTimeout ){
					// timeout
					a7.events.publish( "auth.sessionTimeout" );
					return;
				}else if( _token !== undefined && _token !== null ){
					// set X-Token
					if( params.headers === undefined ){
						params.headers = {
							"X-Token": _token
						};
					}else{
						params.headers["X-Token"] = _token;
					}
				}

				_time = currentTime;
			}
			request = new Request( uri, params );
			//calling the native JS fetch method ...
			promise = fetch( request );

			promise
				.then( function( response ){
					if( secure && _options.useTokens ){
						var token = response.headers.get( "X-Token" );
						if( token !== undefined && token !== null ){
							_token = token;
							sessionStorage.token = token;

							if( _sessionTimer !== undefined ){
								clearTimeout( _sessionTimer );
							}
							_sessionTimer =	setTimeout( function(){ a7.remote.invoke( "auth.refresh" ); }, _options.sessionTimeout );

						} else{
							a7.events.publish( "auth.sessionTimeout" );
						}
					}
				});

			return promise;
		},

		invoke: function( moduleAction, params ){
			var mA = moduleAction.split( "." );
			// if no action specified, return the list of actions
			if( mA.length < 2 ){
				a7.log.error( "No action specified. Valid actions are: " + Object.keys( _modules[ mA[ 0 ] ] ).toString() );
				return;
			}
			if( typeof _modules[ mA[ 0 ] ][ mA[ 1 ] ] === "function" ){
			//	_modules[ mA[ 0 ] ][ mA[ 1 ] ].apply( _modules[ mA[ 0 ] ][ mA[ 1 ] ].prototype, params );
				_modules[ mA[ 0 ] ][ mA[ 1 ] ]( params );
			}
		}
	};
}());

a7.security = (function() {
  "use strict";

  var _isAuthenticated = function(resolve, reject) {
    a7.log.info("Checking authenticated state.. ");
    if (a7.model.get("a7.remote.useTokens")) {
      var token = a7.remote.getToken();
      if (token !== undefined && token !== null && token.length > 0) {
        var timer = a7.remote.getSessionTimer();
        // if the timer isn't defined, that means the app just reloaded, so we need to refresh against the server
        if (timer === undefined) {
          a7.log.info("Refreshing user...");
          // if there is a valid token, check authentication state with the server
          a7.events.publish("auth.refresh", { resolve:resolve, reject: reject});
        } else {
          resolve(true);
        }
      } else {
        resolve(false);
      }
    }
  };

  return {
    isAuthenticated: _isAuthenticated,
    // initialization
    // 1. creates a new a7.User object
    // 2. checks sessionStorage for user string
    // 3. populates User object with stored user information in case of
    // 	  browser refresh
    // 4. sets User object into a7.model

    init: function() {
      a7.log.info("Security initializing...");
      var suser,
        user = a7.components.Constructor(a7.components.User, [], true);
      if (sessionStorage.user && sessionStorage.user !== "") {
        suser = JSON.parse(sessionStorage.user);
        Object.keys(suser).map(function(key) {
          user[key] = suser[key];
        });
      }
      a7.model.set("a7.user", user);
    }
  };
})();

a7.ui = (function() {
  "use strict";

  const resourceEvents = [
    'cached',
    'error',
    'abort',
    'load',
    'beforeunload'
  ];

  const networkEvents = [
    'online',
    'offline'
  ];

  const focusEvents = [
    'focus',
    'blur'
  ];

  const websocketEvents = [
    'open',
    'message',
    'error',
    'close'
  ];

  const sessionHistoryEvents = [
    'pagehide',
    'pageshow',
    'popstate'
  ];

  const cssAnimationEvents = [
    'animationstart',
    'animationend',
    'animationiteration'
  ];

  const cssTransitionEvents = [
    'transitionstart',
    'transitioncancel',
    'transitionend',
    'transitionrun'
  ];

  const formEvents = [
    'reset',
    'submit'
  ];

  const printingEvents = [
    'beforeprint',
    'afterprint'
  ];

  const textCompositionEvents = [
    'compositionstart',
    'compositionupdate',
    'compositionend'
  ];

  const viewEvents = [
    'fullscreenchange',
    'fullscreenerror',
    'resize',
    'scroll'
  ];

  const clipboardEvents = [
    'cut',
    'copy',
    'paste'
  ];

  const keyboardEvents = [
    'keydown',
    'keypress',
    'keyup'
  ];

  const mouseEvents = [
    'auxclick',
    'click',
    'contextmenu',
    'dblclick',
    'mousedown',
    'mousenter',
    'mouseleave',
    'mousemove',
    'mouseover',
    'mouseout',
    'mouseup',
    'pointerlockchange',
    'pointerlockerror',
    'wheel'
  ];

  const dragEvents = [
    'drag',
    'dragend',
    'dragstart',
    'dragleave',
    'dragover',
    'drop'
  ];

  const mediaEvents = [
    'audioprocess',
    'canplay',
    'canplaythrough',
    'complete',
    'durationchange',
    'emptied',
    'ended',
    'loadeddata',
    'loadedmetadata',
    'pause',
    'play',
    'playing',
    'ratechange',
    'seeked',
    'seeking',
    'stalled',
    'suspend',
    'timeupdate',
    'columechange',
    'waiting'
  ];

  const progressEvents = [
    // duplicates from resource events
    /* 'abort',
    'error',
    'load', */
    'loadend',
    'loadstart',
    'progress',
    'timeout'
  ];

  const storageEvents = [
    'change',
    'storage'
  ];

  const updateEvents = [
    'checking',
    'downloading',
    /* 'error', */
    'noupdate',
    'obsolete',
    'updateready'
  ];

  const valueChangeEvents = [
    'broadcast',
    'CheckBoxStateChange',
    'hashchange',
    'input',
    'RadioStateChange',
    'readystatechange',
    'ValueChange'
  ];

  const uncategorizedEvents = [
    'invalid',
    'localized',
    /* 'message',
    'open', */
    'show'
  ];

  const _standardEvents = resourceEvents.concat( networkEvents ).concat( focusEvents ).concat( websocketEvents ).concat( sessionHistoryEvents ).concat( cssAnimationEvents )
            .concat( cssTransitionEvents ).concat( formEvents ).concat( printingEvents ).concat( textCompositionEvents ).concat( viewEvents ).concat( clipboardEvents )
            .concat( keyboardEvents ).concat( mouseEvents ).concat( dragEvents ).concat( mediaEvents ).concat( progressEvents ).concat( storageEvents )
            .concat( updateEvents ).concat( valueChangeEvents ).concat( uncategorizedEvents );

  var
    _events = [],
    _options = {},
    _selectors = {},
    //_templateMap = {},
    _views = [],
    _setSelector = function(name, selector) {
      _selectors[name] = selector;
    },
    _getSelector = function(name){
      return _selectors[name];
    },
    _setView = function( id, view, selector ){
      switch( _options.renderer ){
        case "Handlebars":
        case "Mustache":
        case "templateLiterals":
          _views[ id ] = { view: view,
            selector: selector,
            render: function(){
              selector.innerHTML = view.render();

              var eventArr = [];
              _events.forEach( function( eve ){
                eventArr.push("[data-on" + eve + "]");
              });
              var eles = selector.querySelectorAll( eventArr.toString() );

              eles.forEach( function( sel ){
                for( var ix=0; ix < sel.attributes.length; ix++ ){
                  var attribute = sel.attributes[ix];
                  if( attribute.name.startsWith( "data-on" ) ){
                    var event = attribute.name.substring( 7, attribute.name.length );
                    sel.addEventListener( event, view.eventHandlers[ sel.attributes["data-on" + event].value ] );
                  }
                }
              });
            }
          };

          // call the ui render() function when called to render
          _views[ id ].view.on( "mustRender", function(){
            _views[ id ].render();
          });

          _views[ id ].view.fireEvent( "mustRender" );
          break;
      }
    },
    _getView = function( id ){
      return _views[ id ];
    },
    _removeView = function( id ){
      delete _views[ id ];
    };

  return {
    //render: _render,
    selectors: _selectors,
    getSelector: _getSelector,
    setSelector: _setSelector,
    setView: _setView,
    getView: _getView,
    removeView: _removeView,
    views: _views,

    init: function(resolve, reject) {
      a7.log.info("Layout initializing...");
      _options = a7.model.get("a7.ui");

      // set event groups to create listeners for
      var eventGroups = ( _options.eventGroups ? _options.eventGroups : 'standard' );
      switch( eventGroups ){
        case "extended":
          // extended events not implemented yet
          reject( "Extended events are not implemented yet." );
        case "standard":
          _events = _standardEvents;
          break;
        default:
          _options.eventGroups.forEach( function( group ){
            _events = _events.concat( (group) );
          });
      }

      resolve();
    }
  };
})();

a7.util = ( function(){


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