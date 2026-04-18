<?php 
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

// Load the HARU theme framework, all functions for theme will in includes folder in framework folder
require get_template_directory()  . '/framework/haru-framework.php';

// Remove plugin flag from redux. Get rid of redirect
if ( ! function_exists( 'haru_remove_as_plugin_flag' ) ) {
	function haru_remove_as_plugin_flag() {
	    ReduxFramework::$_as_plugin = false;
	}

	add_action( 'redux/construct', 'haru_remove_as_plugin_flag' );
}

if ( ! function_exists( 'haru_add_theme_support' ) ) {
	function haru_add_theme_support() {
	    add_theme_support( 'html5', [ 'script', 'style' ] );
	}

	add_action( 'after_setup_theme', 'haru_add_theme_support' );
}
