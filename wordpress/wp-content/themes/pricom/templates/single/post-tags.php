<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/
?>
<div class="single-post-tags">
    <?php the_tags('<div class="post-meta-tag"><span class="tag-title">'. esc_html__( 'Tags','pricom' ) .': </span>', '', '</div>'); ?>
</div>