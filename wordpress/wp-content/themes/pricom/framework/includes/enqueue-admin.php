<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

/* Register Font Admin */
if ( ! function_exists( 'haru_fonts_url_admin' ) ) {
    function haru_fonts_url_admin() {
        $font_url = '';
        
        $outfit = _x( 'on', 'Outfit font: on or off', 'pricom' );
        $yellow = _x( 'on', 'Bodoni Moda font: on or off', 'pricom' );

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

if ( ! function_exists( 'haru_admin_enqueue_scripts' ) ) {
    function haru_admin_enqueue_scripts() {
        // Enqueue Script
        wp_enqueue_script( 'haru-admin-js', get_template_directory_uri() . '/framework/admin-assets/js/haru-admin.js',array(), '1.0.0', true );

        // Enqueue CSS
        wp_enqueue_style( 'haru-admin-style', get_template_directory_uri() . '/framework/admin-assets/css/admin-style.css', false, '1.0.0' );

        wp_enqueue_style( 'haru-admin-redux', get_template_directory_uri() . '/framework/admin-assets/css/admin-redux.css', false, '1.0.0' );

        // Load font for Editor
        wp_enqueue_style( 'haru-fonts-admin', haru_fonts_url_admin(), array(), '1.0.0' );
    }

    add_action( 'admin_enqueue_scripts', 'haru_admin_enqueue_scripts' );
}
