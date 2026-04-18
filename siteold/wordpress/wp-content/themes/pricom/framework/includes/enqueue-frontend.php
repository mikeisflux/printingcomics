<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

/* Register Font */
if ( ! function_exists( 'haru_fonts_url' ) ) {
    function haru_fonts_url() {
        $font_url = '';
        
        $outfit = _x( 'on', 'Outfit font: on or off', 'pricom' );
        $yellow = _x( 'on', 'Yellowtail font: on or off', 'pricom' );

        if ( 'off' !== $outfit || 'off' !== $yellow ) {
            $font_families = array();
        }

        if ( 'off' !== $outfit ) {
            $font_families[] = 'Outfit:100,200,300,400,500,600,700,800,900';
        }

        if ( 'off' !== $yellow ) {
            $font_families[] = 'Yellowtail:400';
        }

        $query_args = array(
            'family' => urlencode( implode( '|', $font_families ) ),
            'subset' => urlencode( 'latin,latin-ext' ),
        );

        $fonts_url = add_query_arg( $query_args, '//fonts.googleapis.com/css' );

        return esc_url_raw( $fonts_url );
    }
}

/* Load theme css */
if ( ! function_exists( 'haru_enqueue_styles' ) ) {
    function haru_enqueue_styles() {
        // /* Font-awesome */
        wp_enqueue_style( 'fontawesome', get_template_directory_uri() . '/assets/libraries/fontawesome/css/all.min.css', array() );

        /* Haru Icons */
        wp_enqueue_style( 'haruicons', get_template_directory_uri() . '/assets/libraries/haruicons/haruicons.css', array() );

        /* Pricom Icons */
        wp_enqueue_style( 'pricons', get_template_directory_uri() . '/assets/libraries/pricons/pricons.css', array() );

         wp_enqueue_style( 'phosphor', get_template_directory_uri() . '/assets/libraries/phosphor/phosphor.css', array() );

        /* jPlayer */ 
        if ( ( 'post' == get_post_type() ) || is_archive() || is_single() ) {
            wp_enqueue_style( 'jplayer', get_template_directory_uri() . '/assets/libraries/jPlayer/skin/haru/skin.css', array() );
        }

        /* owl-carousel */ 
        wp_enqueue_style( 'owl-carousel', get_template_directory_uri() . '/assets/libraries/owl-carousel/assets/owl.carousel.min.css', array() );

        /* slick */ 
        wp_enqueue_style( 'slick', get_template_directory_uri() . '/assets/libraries/slick/slick.css', array() );

        // fancybox
        wp_enqueue_style( 'fancybox', get_template_directory_uri() . '/assets/libraries/fancybox/jquery.fancybox.min.css', array() );

        /* Magnific Popup */ 
        wp_enqueue_style( 'magnific-popup', get_template_directory_uri() . '/assets/libraries/magnificPopup/magnific-popup.css', array() );

        // Mega Menu @on page doesn't load Elementor
        wp_enqueue_style( 'menu-animate', get_template_directory_uri() . '/assets/libraries/animate/animate.min.css' );

        // Validate HTML: dashicons style

        // Load Theme CSS custom
        $style_dir  = wp_upload_dir()['basedir'];
        $style_uri  = wp_upload_dir()['baseurl'];

        if ( file_exists( $style_dir . '/style-custom.min.css' ) && ! defined( 'HARU_DEVELOPE_MODE' ) ) {
            wp_enqueue_style( 'haru-theme-style', $style_uri . '/style-custom.min.css' );
        } else {
            /* Theme CSS */
            wp_enqueue_style( 'haru-theme-style', get_template_directory_uri() . '/style.css' );
        }

        // Load default font
        if ( ! class_exists( 'ReduxFramework' ) ) {
            wp_enqueue_style( 'haru-fonts', haru_fonts_url(), array(), '1.0.0' );
        }
    }

    add_action('wp_enqueue_scripts', 'haru_enqueue_styles' );
}

/* Load theme js */
if ( ! function_exists( 'haru_enqueue_script' ) ) {
    function haru_enqueue_script() {
        /* Comments */
        if ( is_singular() && comments_open() && get_option( 'thread_comments' ) ) {
            wp_enqueue_script( 'comment-reply' );
        }

        /* jPlayer */
        if ( ( 'post' == get_post_type() ) || is_archive() || is_single() ) {
            wp_enqueue_script( 'jplayer', get_template_directory_uri() . '/assets/libraries/jPlayer/jquery.jplayer.min.js', array( 'jquery' ), '', true );
        }

        /* owl-carousel */ 
        wp_enqueue_script( 'owl-carousel', get_template_directory_uri() . '/assets/libraries/owl-carousel/owl.carousel.min.js', array( 'jquery' ), '', true );

        /* slick */ 
        wp_enqueue_script( 'slick', get_template_directory_uri() . '/assets/libraries/slick/slick.min.js', array( 'jquery' ), '', true );

        /* fancybox */
        wp_enqueue_script( 'fancybox', get_template_directory_uri() . '/assets/libraries/fancybox/jquery.fancybox.min.js', array( 'jquery' ), '', true );

        /* Cookie and Magnific popup */
        wp_enqueue_script( 'jquery-cookie', get_template_directory_uri() . '/assets/libraries/cookie/js.cookie.js', array( 'jquery' ), '', true);
        wp_enqueue_script( 'magnific-popup', get_template_directory_uri() . '/assets/libraries/magnificPopup/jquery.magnific-popup.min.js', array( 'jquery' ), '', true);

        /* Cart variation on quick view */
        if ( class_exists( 'WooCommerce' ) ) {
            wp_enqueue_script( 'wc-add-to-cart-variation' );
            wp_enqueue_script( 'wc-add-to-cart' );
        }

        /* Load theme main js */
        wp_enqueue_script( 'haru-theme-script', get_template_directory_uri() . '/assets/js/index.js', array( 'jquery' ), false, true );

        if ( class_exists( 'Haru_Pricom' ) ) {
            wp_add_inline_script( 'haru-theme-script', 'var haru_pricom_ajax_url = "' . get_site_url() . '/wp-admin/admin-ajax.php?activate-multi=true' . '"', 'before' );
        }
    }

    add_action( 'wp_enqueue_scripts', 'haru_enqueue_script' );
    add_action( 'wp_enqueue_scripts', 'haru_enqueue_custom_script', 15 );
}

/* Load theme options custom js */
if ( ! function_exists('haru_enqueue_custom_script') ) {
    function haru_enqueue_custom_script() {
        $custom_js = haru_get_option( 'haru_custom_js', '' );

        wp_add_inline_script( 'haru-theme-script', $custom_js );
    }
}

