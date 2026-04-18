<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

if ( ! function_exists( 'haru_theme_setup' ) ) {
    function haru_theme_setup() {

        // Add default posts and comments RSS feed links to head.
        add_theme_support( 'automatic-feed-links' );

        // Declare WooCommerce support
        add_theme_support( 'woocommerce', apply_filters( 'haru_woocommerce_args', array(
            'gallery_thumbnail_image_width'    => 150
        ) ) );
        add_theme_support( 'wc-product-gallery-lightbox' );
        add_theme_support( 'wc-product-gallery-zoom' );

        /*
         * Enable support for Post Thumbnails on posts and pages.
         *
         * @link http://codex.wordpress.org/Function_Reference/add_theme_support#Post_Thumbnails
         */
        add_theme_support( 'post-thumbnails' );

        // Enable support for Post Formats.
        add_theme_support( 'post-formats', array( 'image', 'gallery', 'video', 'audio', 'quote', 'link', 'aside' ) );

        // Add support for title-tag (themecheck)
        global $wp_version;
        if ( version_compare( $wp_version, '4.1', '>=' ) ){
            add_theme_support( 'title-tag' );
        }

        // Add support custom (themecheck)
        if ( version_compare( $wp_version, '3.4', '>=' ) ) {
            add_theme_support( 'custom-header');
            add_theme_support( 'custom-background');
        }

        // Add editor style (themecheck)
        add_theme_support( 'editor-styles' );
        add_editor_style( array( '/assets/css/editor-style.css' ) );

        // Add $content_width (themecheck)
        if ( ! isset( $content_width ) ) $content_width = 900;

        // This theme uses wp_nav_menu() in one location.
        register_nav_menus( array(
            'primary-menu'  => esc_html__( 'Primary Menu', 'pricom' ),
            'mobile'   => esc_html__( 'Mobile Menu', 'pricom' ),
        ) );

        $language_path = get_template_directory() . '/languages';
        load_theme_textdomain( 'pricom', $language_path );

    }

    add_action( 'after_setup_theme', 'haru_theme_setup');
}

if ( ! function_exists( 'haru_theme_activation' ) ) {
    function haru_theme_activation () {
        remove_theme_mods();

        // set frontpage to display posts (archive blog)
        update_option( 'show_on_front', 'posts' );

        // flush rewrite rules
        flush_rewrite_rules();

        do_action('haru_theme_activation');

        if ( class_exists( 'TGM_Plugin_Activation' ) ) {
            $tgmpa                       = TGM_Plugin_Activation::$instance;
            $is_redirect_require_install = false;

            foreach( $tgmpa->plugins as $p ) {
                $path =  ABSPATH . 'wp-content/plugins/'.$p['slug'];
                if ( ! is_dir( $path ) ) {
                    $is_redirect_require_install = true;

                    break;
                }
            }

            if ( $is_redirect_require_install )
                header( 'Location: ' . admin_url() . 'themes.php?page=tgmpa-install-plugins&plugin_status=install' ) ;
        }
    }

    add_action('after_switch_theme', 'haru_theme_activation');
}

// Add to the allowed tags array and hook into WP comments (wp_kses_post will work echo thumbnail)
if ( ! function_exists( 'haru_allowed_tags' ) ) {
    function haru_allowed_tags( $tags, $context ) {
        $tags['a']['data-hash']             = array(true);
        $tags['a']['data-product_id']       = array(true);
        $tags['a']['data-original-title']   = array(true);
        $tags['a']['aria-describedby']      = array(true);
        $tags['a']['title']                 = array(true);
        $tags['a']['data-quantity']         = array(true);
        $tags['a']['data-product_sku']      = array(true);
        $tags['a']['rel']                   = array(true);
        $tags['a']['data-rel']              = array(true);
        $tags['a']['data-product-type']     = array(true);
        $tags['a']['data-product-id']       = array(true);
        $tags['a']['data-toggle']           = array(true);
        $tags['div']['data-plugin-options'] = array(true);
        $tags['div']['data-player']         = array(true);
        $tags['div']['data-audio']          = array(true);
        $tags['div']['data-title']          = array(true);
        $tags['textarea']['placeholder']    = array(true);
        // Owl Carousel
        $tags['div']['data-items']          = array(true);
        $tags['div']['data-items-desktop']  = array(true);
        $tags['div']['data-items-tablet']   = array(true);
        $tags['div']['data-items-mobile']   = array(true);
        $tags['div']['data-margin']         = array(true);
        $tags['div']['data-autoplay']       = array(true);
        $tags['div']['data-slide-duration'] = array(true);
        
        $tags['iframe']['align']            = array(true);
        $tags['iframe']['frameborder']      = array(true);
        $tags['iframe']['height']           = array(true);
        $tags['iframe']['longdesc']         = array(true);
        $tags['iframe']['marginheight']     = array(true);
        $tags['iframe']['marginwidth']      = array(true);
        $tags['iframe']['name']             = array(true);
        $tags['iframe']['sandbox']          = array(true);
        $tags['iframe']['scrolling']        = array(true);
        $tags['iframe']['seamless']         = array(true);
        $tags['iframe']['src']              = array(true);
        $tags['iframe']['srcdoc']           = array(true);
        $tags['iframe']['width']            = array(true);
        $tags['iframe']['defer']            = array(true);
        $tags['iframe']['allowfullscreen']  = array(true);
        
        $tags['input']['accept']            = array(true);
        $tags['input']['align']             = array(true);
        $tags['input']['alt']               = array(true);
        $tags['input']['autocomplete']      = array(true);
        $tags['input']['autofocus']         = array(true);
        $tags['input']['checked']           = array(true);
        $tags['input']['class']             = array(true);
        $tags['input']['disabled']          = array(true);
        $tags['input']['form']              = array(true);
        $tags['input']['formaction']        = array(true);
        $tags['input']['formenctype']       = array(true);
        $tags['input']['formmethod']        = array(true);
        $tags['input']['formnovalidate']    = array(true);
        $tags['input']['formtarget']        = array(true);
        $tags['input']['height']            = array(true);
        $tags['input']['list']              = array(true);
        $tags['input']['max']               = array(true);
        $tags['input']['maxlength']         = array(true);
        $tags['input']['min']               = array(true);
        $tags['input']['multiple']          = array(true);
        $tags['input']['name']              = array(true);
        $tags['input']['pattern']           = array(true);
        $tags['input']['placeholder']       = array(true);
        $tags['input']['readonly']          = array(true);
        $tags['input']['required']          = array(true);
        $tags['input']['size']              = array(true);
        $tags['input']['src']               = array(true);
        $tags['input']['step']              = array(true);
        $tags['input']['type']              = array(true);
        $tags['input']['value']             = array(true);
        $tags['input']['width']             = array(true);
        $tags['input']['accesskey']         = array(true);
        $tags['input']['class']             = array(true);
        $tags['input']['contenteditable']   = array(true);
        $tags['input']['contextmenu']       = array(true);
        $tags['input']['dir']               = array(true);
        $tags['input']['draggable']         = array(true);
        $tags['input']['dropzone']          = array(true);
        $tags['input']['hidden']            = array(true);
        $tags['input']['id']                = array(true);
        $tags['input']['lang']              = array(true);
        $tags['input']['spellcheck']        = array(true);
        $tags['input']['style']             = array(true);
        $tags['input']['tabindex']          = array(true);
        $tags['input']['title']             = array(true);
        $tags['input']['translate']         = array(true);
        
        $tags['span']['data-id']            = array(true);

        switch ( $context ) {
            case 'default': 
                return $tags;

            default: 
              return $tags;
        }
    }

    add_filter( 'wp_kses_allowed_html', 'haru_allowed_tags', 10, 2 );
}