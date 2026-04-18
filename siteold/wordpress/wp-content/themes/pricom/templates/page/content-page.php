<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

?>
<div id="post-<?php the_ID(); ?>" <?php post_class(); ?>>
    <div class="entry-content">
        <?php the_content(); ?>
    </div>
    <?php wp_link_pages(array(
        'before'      => '<div class="haru-page-links"><span class="haru-page-links-title">' . esc_html__( 'Pages:', 'pricom' ) . '</span>',
        'after'       => '</div>',
        'link_before' => '<span class="haru-page-link">',
        'link_after'  => '</span>',
    )); ?>
</div>
