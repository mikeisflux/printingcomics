<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

$home_preloader = haru_get_option( 'haru_home_preloader', '' );

if ( $home_preloader == '' || empty( $home_preloader ) ) {
    return;
}

$home_preloader_bg_color      = haru_get_option( 'haru_home_preloader_bg_color', '' );
$home_preloader_spinner_color = haru_get_option( 'haru_home_preloader_spinner_color', '' );

$custom_bg_color = '';
if ( $home_preloader_bg_color && isset( $home_preloader_bg_color['rgba'] ) ) {
    $custom_bg_color = 'style="background-color:'. $home_preloader_bg_color['rgba'] . ';"';
}

$custom_spinner_color = '';
if ( ! empty( $home_preloader_spinner_color ) ) {
    $custom_spinner_color = 'style="background-color:' . $home_preloader_spinner_color. ';"';
}

?>

<div id="haru-site-preloader" <?php echo wp_kses( $custom_bg_color, 'default' );?> class="<?php echo esc_attr( $home_preloader ); ?>">
    <div class="haru-loading-site">
        <div class="haru-loading-site-absolute">
            <?php if ( $home_preloader == 'square-1' ) : ?>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner"></div>
            <?php endif; ?>

            <?php if ( $home_preloader == 'square-2' ) : ?>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_one"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_two"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_three"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_four"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_five"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_six"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_seven"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_eight"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_big"></div>
            <?php endif; ?>

            <?php if ( $home_preloader == 'square-3' ) : ?>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="first_spinner"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="second_spinner"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="third_spinner"></div>
            <?php endif; ?>

            <?php if ( $home_preloader == 'square-4' ) : ?>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="first_spinner"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="second_spinner"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="third_spinner"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="forth_spinner"></div>
            <?php endif; ?>

            <?php if ( $home_preloader == 'square-5' ) : ?>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_one"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_two"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_three"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_four"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_five"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_six"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_seven"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_eight"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_nine"></div>
            <?php endif; ?>

            <?php if ( $home_preloader == 'square-6' ) : ?>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_one"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_two"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_three"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_four"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_five"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_six"></div>
            <?php endif; ?>

            <?php if ( $home_preloader == 'square-7' ) : ?>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_one"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_two"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_three"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_four"></div>
            <?php endif; ?>

            <?php if ( $home_preloader == 'square-8' ) :  ?>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_one"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_two"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_three"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_four"></div>
            <?php endif; ?>

            <?php if ( $home_preloader == 'square-9' ) :  ?>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_one"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_two"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_three"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_four"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_big"></div>
            <?php endif; ?>

            <?php if ( $home_preloader == 'round-1' ) : ?>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_one"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_two"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_three"></div>
            <?php endif; ?>

            <?php if ( $home_preloader == 'round-2' ) : ?>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_one"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_two"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_three"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_four"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_five"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_six"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_seven"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_eight"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_big"></div>
            <?php endif; ?>

            <?php if ( $home_preloader == 'round-3' ) : ?>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="first_spinner"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="second_spinner"></div>
            <?php endif; ?>

            <?php if ( $home_preloader == 'round-4' ) : ?>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner"></div>
            <?php endif; ?>

            <?php if ( $home_preloader == 'round-5' ) : ?>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_one"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_two"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_three"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_four"></div>
            <?php endif; ?>

            <?php if ( $home_preloader == 'round-6' ) : ?>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_one"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_two"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_three"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_four"></div>
            <?php endif; ?>

            <?php if ( $home_preloader == 'round-7' ) :  ?>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_one"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_two"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_three"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_four"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_five"></div>
            <?php endif; ?>

            <?php if ( $home_preloader == 'round-8' ) : ?>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_one"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_two"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_three"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_four"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_five"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_six"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_seven"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_eight"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_nine"></div>
            <?php endif; ?>

            <?php if ( $home_preloader == 'round-9' ) : ?>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_one"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_two"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_three"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_four"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_five"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_six"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_seven"></div>
                <div <?php echo wp_kses( $custom_spinner_color, 'default' ); ?> class="spinner" id="spinner_eight"></div>
            <?php endif; ?>

        </div>
    </div>
</div>
