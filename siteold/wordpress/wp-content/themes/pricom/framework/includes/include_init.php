<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/


// Include Redux theme options
if ( ! function_exists( 'haru_include_theme_options' ) && class_exists( 'ReduxFramework' ) ) {
    function haru_include_theme_options() {
        // Use this to override Redux Framework
        if ( file_exists( get_template_directory() . '/framework/core/haru_reduxframework.php' ) ) {
            require_once get_template_directory() . '/framework/core/haru_reduxframework.php';
        }

        // Load the theme/plugin options
        if ( file_exists( get_template_directory() . '/framework/includes/theme-options.php' ) ) {
            require_once get_template_directory() . '/framework/includes/theme-options.php';
        }
    }
    
    haru_include_theme_options();
}

// Include core files
if ( ! function_exists( 'haru_include_core_files' ) ) {
    function haru_include_core_files() {
        require_once( get_template_directory() . '/framework/includes/tgmpa-register.php' ); // Required plugins for theme
        require_once( get_template_directory() . '/framework/includes/theme-setup.php' ); // Declare theme_support(), load_theme_textdomain(),...
        require_once( get_template_directory() . '/framework/includes/theme-functions.php' ); // Include functions as add custom sidebar, ...
        require_once( get_template_directory() . '/framework/includes/theme-hooks.php' ); // Include theme hooks
        require_once( get_template_directory() . '/framework/includes/theme-helpers.php' ); // Helpers

        if ( true == haru_check_woocommerce_status() ) {
            require_once( get_template_directory() . '/framework/includes/woocommerce-functions.php' ); // Include woocommerce functions ...
            require_once( get_template_directory() . '/framework/includes/woocommerce-hooks.php' ); // Include woocommerce hooks
        }
        
        require_once( get_template_directory() . '/framework/includes/theme-sidebar.php' ); // Add sidebar and custom sidebar for theme
        require_once( get_template_directory() . '/framework/includes/enqueue-admin.php' ); // Add assets for back-end
        require_once( get_template_directory() . '/framework/includes/enqueue-frontend.php' ); // Load assets for front-end

        require_once( get_template_directory() . '/framework/includes/custom-plugins.php' ); // Custom plugins functions

        // Compile theme stylesheet
        if ( true == haru_check_core_plugin_status() ) {
            if ( file_exists( WP_PLUGIN_DIR . '/haru-pricom/includes/scss/_init.php' ) ) {
                require_once( WP_PLUGIN_DIR . '/haru-pricom/includes/scss/_init.php' );
            }
        }
    }

    haru_include_core_files();
}
