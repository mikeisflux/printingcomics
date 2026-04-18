<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/
?>

<form role="search" method="get" class="search-form" action="<?php echo esc_url( home_url( '/' ) ); ?>">
    <label>
        <span class="screen-reader-text"><?php echo esc_html__( 'Search for:', 'pricom' ); ?></span>
        <input type="search" class="search-field" placeholder="<?php echo esc_attr__( 'Search...', 'pricom' ); ?>" value="<?php echo get_search_query(); ?>" name="s" />
    </label>
    <button type="submit" class="search-submit"><span><?php echo esc_html__( 'Search', 'pricom' ); ?></span></button>
</form>