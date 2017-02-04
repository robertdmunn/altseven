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