<?php
/**
 * The template for displaying the header
 *
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
 */

?>
<!DOCTYPE html>
<!-- Open HTML -->
<html <?php language_attributes(); ?>>
    <!-- Open Head -->
    <head>
        <meta charset="<?php bloginfo( 'charset' ); ?>">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="profile" href="//gmpg.org/xfn/11">
        <?php if ( ! function_exists( 'has_site_icon' ) || ! has_site_icon() ) : ?>
            <?php 
                $custom_favicon = haru_get_option( 'haru_custom_favicon' );
                if ( isset($custom_favicon) && ! empty( $custom_favicon['url'] ) ) : 
            ?>
                <link rel="shortcut icon" href="<?php echo esc_url( haru_get_option( 'haru_custom_favicon' )['url'] ); ?>" />
            <?php endif; ?>
        <?php endif; ?>
        <?php wp_head(); ?>
    </head>
    <!-- Close Head -->
    <body <?php body_class(); ?>>
        <?php wp_body_open(); ?>
        <?php 
            /*
            *   @hooked - haru_loading_animation - 5;
            *   @hooked - haru_newsletter_popup - 10;
            *   @hooked - haru_onepage_navigation - 15;
            */
            do_action( 'haru_before_page_main' );
        ?>
        <!-- Open Haru Main -->
        <div id="haru-main">
            <?php 
                /*
                *   @hooked - haru_page_header - 5
                */
                do_action( 'haru_before_page_main_content' );
            ?>
            <!-- Open Haru Main Content -->
            <div id="haru-content-main" class="clearfix">
            <?php 
                /*
                *   @hooked - haru_main_content start
                */
                do_action( 'haru_main_content_start' );
            ?>