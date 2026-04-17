<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

$dark_mode_button = haru_get_option( 'haru_dark_mode_button', '0' );
$dark_mode = haru_get_option( 'haru_dark_mode', '0' );
?>
<?php if ( $dark_mode_button == '1' ) : ?>
<div class="switch-theme-mode" data-text-default="<?php echo ( '1' == $dark_mode ) ? esc_html__( 'Dark', 'pricom' ) : esc_html__( 'Light', 'pricom' ); ?>" data-text-dark="<?php echo esc_html__( 'Dark', 'pricom' ); ?>" data-text-light="<?php echo esc_html__( 'Light', 'pricom' ); ?>">
	<div class="button-switch-mode">
		<div class="button-switch-label">
			<div class="button-switch-light"><?php echo esc_html__( 'Light', 'pricom' ); ?></div>
			<div class="button-switch-dark"><?php echo esc_html__( 'Dark', 'pricom' ); ?></div>
		</div>
		<div class="button-switch"></div>
	</div>
</div>
<?php endif; ?>
