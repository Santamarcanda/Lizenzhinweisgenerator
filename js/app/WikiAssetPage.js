/**
 * @licence GNU GPL v3
 * @author snater.com < wikimedia@snater.com >
 */

'use strict';

var $ = require( 'jquery' ),
	Author = require( './Author' ),
	WikiAsset = require( './WikiAsset' ),
	LicenceStore = require( './LicenceStore' ),
	config = require( '../config.json' ),
	licenceStore = new LicenceStore( require( './LICENCES' ), config.portedLicences );

/**
 * Represents a Commons asset page.
 * @constructor
 *
 * @param {string} prefixedFilename
 * @param {string} mediaType
 * @param {jQuery} $dom
 * @param {string[]} templates
 * @param {Api} api
 * @param {string} [wikiUrl]
 *
 * @throws {Error} if a required parameter is not specified.
 */
var WikiAssetPage = function( prefixedFilename,
	mediaType,
	$dom,
	templates,
	api,
	wikiUrl ) {
	if( !prefixedFilename || !mediaType || !$dom || !templates || !api ) {
		throw new Error( 'Unable to instantiate object' );
	}
	this._prefixedFilename = prefixedFilename;
	this._mediaType = mediaType;
	this._$dom = $dom;
	this._templates = templates;
	this._api = api;
	this._wikiUrl = wikiUrl || api.getDefaultUrl();
};

$.extend( WikiAssetPage.prototype, {
	/**
	 * The page's filename.
	 * @type {string}
	 */
	_prefixedFilename: null,

	/**
	 * The asset's media type.
	 * @type {string}
	 */
	_mediaType: null,

	/**
	 * @type {string}
	 */
	_wikiUrl: null,

	/**
	 * The page content DOM.
	 * @type {jQuery}
	 */
	_$dom: null,

	/**
	 * The page's templates.
	 * @type {string[]}
	 */
	_templates: null,

	/**
	 * @type {Api}
	 */
	_api: null,

	/**
	 * @type {WikiAsset}
	 */
	_asset: null,

	/**
	 * Returns the asset represented by the page.
	 *
	 * @return {WikiAsset}
	 */
	getAsset: function() {
		if( !this._asset ) {
			this._asset = new WikiAsset(
				this._prefixedFilename,
				this._mediaType,
				this._detectLicence( this._templates ),
				this._prefixedFilename
					.replace( /^[^:]+:/, '' )
					.replace( /\.[^.]+$/, '' )
					.replace( /_/g, ' ' ),
				this._scrapeAuthors(),
				null,
				this._scrapeAttribution(),
				this._api,
				this._wikiUrl
			);
		}
		return this._asset;
	},

	_detectLicence: function() {
		return licenceStore.detectLicence( this._templates );
	},

	/**
	 * Extracts contents of a summary field
	 *
	 * @param {jQuery} $node
	 * @return {jQuery}
	 */
	_scrapeSummaryField: function( $node ) {
		var $field = this._sanitizeUrls( $node.contents() );

		$field = this._flattenVcardDivs( $field );

		// Remove useless wrapping nodes:
		if( $field.length === 1 ) {
			var nodeName = $field.get( 0 ).nodeName;

			if( nodeName !== 'A' && nodeName !== '#text' ) {
				$field = $field.contents();
			}
		}

		// Remove "talk" link:
		$field.each( function( i ) {
			var $node = $( this );
			if( this.nodeName === 'A' && $node.text() === 'talk' ) {
				$field = $field
					.not( $field.eq( i + 1 ) )
					.not( $node )
					.not( $field.eq( i - 1 ) );
			}
		} );

		$field = this._removeUnwantedHtmlTags( $field );
		$field = this._removeUnwantedWhiteSpace( $field );

		return this._trimNodeList( $field );
	},

	/**
	 * Extracts the author(s) from the DOM.
	 *
	 * @return {Author[]}
	 */
	_scrapeAuthors: function() {
		var $td = this._$dom.find( '#fileinfotpl_aut' ).next();
		return $td.length === 0 ? [] : [ new Author( this._scrapeSummaryField( $td ) ) ];
	},

	_flattenVcardDivs: function( $nodes ) {
		var $container = $( '<div/>' ).append( $nodes.clone() );
		$container.find( 'div.vcard' ).each( function() {
			var $creator = $( this ).find( 'span#creator' );
			$( this ).html( $creator.html() );
		} );
		return $container.contents();
	},

	_removeUnwantedHtmlTags: function( $nodes ) {
		var $container = $( '<div/>' ).append( $nodes.clone() );
		$container.find( '*:not(a)' ).contents().unwrap();
		return $container.contents();
	},

	_removeUnwantedWhiteSpace: function( $nodes ) {
		var $container = $( '<div/>' ).append( $nodes.clone() );
		return $( '<div/>' ).html(
			$.trim( $container.html().replace( '&nbsp;', ' ' ).replace( /\s+/g, ' ' ) )
		).contents();
	},

	/**
	 * Sanitizes every link node with the specified jQuery wrapped nodes.
	 *
	 * @param {jQuery} $nodes
	 * @return {jQuery}
	 */
	_sanitizeUrls: function( $nodes ) {
		var $clonedNodes = $nodes.clone(),
			$container = $( '<div/>' ).append( $clonedNodes );

		$container.find( 'a' ).each( function() {
			var $node = $( this ),
				href = $node.attr( 'href' ),
				attrsToRemove = [];

			if( href.indexOf( '/w/index.php?title=User:' ) === 0 ) {
				href = href.replace(
					/^\/w\/index\.php\?title\=([^&]+).*$/,
					'https://commons.wikimedia.org/wiki/$1'
				);
			} else if( href.indexOf( '/wiki/User:' ) === 0 ) {
				href = 'https://commons.wikimedia.org' + href;
			} else if( href.indexOf( '//' ) === 0 ) {
				href = 'https:' + href;
			}

			$node.attr( 'href', href );
			$.each( $node.get( 0 ).attributes, function( i, attr ) {
				if( attr.name === 'href' ) {
					return;
				}
				attrsToRemove.push( attr.name );
			} );
			$.each( attrsToRemove, function( i, attr ) {
				$node.removeAttr( attr );
			} );
		} );

		return $container.contents();
	},

	/**
	 * Removes edge nodes if they contain white space.
	 *
	 * @param {jQuery} $nodes
	 * @return {jQuery}
	 */
	_trimNodeList: function( $nodes ) {
		if( $nodes.length === 0 ) {
			return $nodes;
		}
		if( $.trim( $nodes.eq( 0 ).text() ) === '' ) {
			$nodes = $nodes.not( $nodes.eq( 0 ) );
		}

		while( $.trim( $nodes.eq( $nodes.length - 1 ).text() ) === '' ) {
			$nodes = $nodes.not( $nodes.eq( $nodes.length - 1 ) );
		}

		return $nodes;
	},

	/**
	 * Extracts the attribution notice from the licence template DOM.
	 *
	 * @return {jQuery|null}
	 */
	_scrapeAttributionFromLicenceTpl: function() {
		var $attribution = this._$dom.find( '.licensetpl_attr' ).first();

		if( $attribution.length === 0 ) {
			return null;
		}

		var $clonedAttribution = $attribution.contents().clone();

		return this._trimNodeList( this._sanitizeUrls( $clonedAttribution ) );
	},

	/**
	 * Scrapes the attribution from its summary table field.
	 *
	 * @returns {jQuery}
	 */
	_scrapeAttributionSummaryField: function() {
		var $td = this._$dom.find( '.commons-file-information-table td:first-child:contains(Attribution)' ).next();
		return $td.length === 0 ? null : this._scrapeSummaryField( $td );
	},

	_scrapeAttribution: function() {
		return this._scrapeAttributionFromLicenceTpl() || this._scrapeAttributionSummaryField();
	}

} );

module.exports = WikiAssetPage;
